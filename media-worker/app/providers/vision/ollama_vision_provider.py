import base64
import io
import json
import re
import time
import urllib.error
import urllib.request
from typing import TYPE_CHECKING

from app.config import (
    ENABLE_VLM,
    VLM_AVAILABILITY_TIMEOUT_S,
    VLM_BASE_URL,
    VLM_MAX_IMAGE_SIZE,
    VLM_MAX_RETRIES,
    VLM_MODEL,
    VLM_PROMPT_LANGUAGE,
    VLM_PROVIDER,
    VLM_REQUEST_TIMEOUT_S,
    VLM_RETRY_BACKOFF_MS,
)
from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image

_PROMPTS = {
    'pt': (
        'Analise esta imagem e responda APENAS com JSON válido, em português: '
        '{"visualSummary":"...","imageType":"...","objects":[],"uiElements":[],'
        '"relationships":[],"charts":[],"potentialIssues":[],"confidence":0.0}'
    ),
    'en': (
        'Analyze this image and respond ONLY with valid JSON: '
        '{"visualSummary":"...","imageType":"...","objects":[],"uiElements":[],'
        '"relationships":[],"charts":[],"potentialIssues":[],"confidence":0.0}'
    ),
}


class OllamaVisionProvider(BaseProvider):
    name = 'ollama-vlm'

    def is_enabled(self) -> bool:
        return ENABLE_VLM and VLM_PROVIDER == 'ollama'

    def is_available(self) -> bool:
        if not self.is_enabled():
            return False
        try:
            req = urllib.request.Request(f'{VLM_BASE_URL}/api/tags', method='GET')
            with urllib.request.urlopen(req, timeout=VLM_AVAILABILITY_TIMEOUT_S) as resp:
                return resp.status == 200
        except Exception:
            return False

    def get_resource_cost(self) -> str:
        return 'high'

    def should_run(
        self,
        mode: str,
        image_type: str,
        ocr_text: str,
        force: bool = False,
    ) -> bool:
        if not self.is_enabled() or mode == 'fast':
            return False
        if force:
            return True
        if mode == 'full':
            return True
        low_text = len(ocr_text.strip()) < 80
        visual_types = {'diagram', 'photo', 'chart', 'chart_table', 'ui_screenshot', 'unknown'}
        return low_text or image_type in visual_types

    def _prepare_image(self, image: 'Image.Image') -> str:
        from app.config import THUMBNAIL_QUALITY

        img = image.copy()
        img.thumbnail((VLM_MAX_IMAGE_SIZE, VLM_MAX_IMAGE_SIZE))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=THUMBNAIL_QUALITY)
        return base64.b64encode(buf.getvalue()).decode('ascii')

    def process(self, image: 'Image.Image', image_type: str, ocr_text: str, mode: str, force: bool = False) -> ProviderResult:
        started = time.time()
        if not self.should_run(mode, image_type, ocr_text, force):
            return ProviderResult(
                provider='skipped',
                data={'enabled': False, 'summary': None, 'objects': [], 'uiElements': [], 'relationships': []},
            )

        if not self.is_available():
            return ProviderResult(
                provider='unavailable',
                warnings=['VLM endpoint unavailable; continuing without visual analysis'],
                data={'enabled': False, 'summary': None, 'objects': [], 'uiElements': [], 'relationships': []},
            )

        warnings: list[str] = []
        prompt = _PROMPTS.get(VLM_PROMPT_LANGUAGE.lower(), _PROMPTS['pt'])

        payload = {
            'model': VLM_MODEL,
            'messages': [{'role': 'user', 'content': prompt, 'images': [self._prepare_image(image)]}],
            'stream': False,
        }
        data = json.dumps(payload).encode('utf-8')

        # Retry só para falhas plausivelmente transitórias (timeout/rede).
        # Modo 'fast' nem chega aqui (should_run barra). Sem retry para 'balanced'
        # além do padrão; 'full' usa o orçamento completo de tentativas.
        max_attempts = 1 if mode == 'balanced' and not force else VLM_MAX_RETRIES
        max_attempts = max(1, max_attempts)

        last_exc: Exception | None = None
        for attempt in range(max_attempts):
            try:
                req = urllib.request.Request(
                    f'{VLM_BASE_URL}/api/chat',
                    data=data,
                    headers={'Content-Type': 'application/json'},
                    method='POST',
                )
                with urllib.request.urlopen(req, timeout=VLM_REQUEST_TIMEOUT_S) as resp:
                    body = json.loads(resp.read().decode('utf-8'))
                content = body.get('message', {}).get('content', '')
                parsed = self._parse_json(content)
                if attempt > 0:
                    warnings.append(f'Ollama VLM recovered after {attempt} retry(ies)')
                return ProviderResult(
                    provider=self.name,
                    data={
                        'enabled': True,
                        'summary': parsed.get('visualSummary'),
                        'objects': parsed.get('objects', []),
                        'uiElements': parsed.get('uiElements', []),
                        'relationships': parsed.get('relationships', []),
                        'charts': parsed.get('charts', []),
                        'potentialIssues': parsed.get('potentialIssues', []),
                        'confidence': parsed.get('confidence'),
                        'imageTypeHint': parsed.get('imageType'),
                    },
                    warnings=warnings,
                    duration_ms=int((time.time() - started) * 1000),
                )
            except Exception as exc:
                last_exc = exc
                if not self._is_transient(exc) or attempt == max_attempts - 1:
                    break
                backoff_s = (VLM_RETRY_BACKOFF_MS / 1000) * (2 ** attempt)
                warnings.append(
                    f'Ollama VLM transient failure (attempt {attempt + 1}/{max_attempts}): {exc}; '
                    f'retrying in {backoff_s:.1f}s'
                )
                time.sleep(backoff_s)

        warnings.append(f'Ollama VLM failed: {last_exc}')
        return ProviderResult(
            provider='failed',
            warnings=warnings,
            data={'enabled': False, 'summary': None, 'objects': [], 'uiElements': [], 'relationships': []},
            duration_ms=int((time.time() - started) * 1000),
        )

    @staticmethod
    def _is_transient(exc: Exception) -> bool:
        """Distingue falhas transitórias (rede/timeout) de permanentes."""
        if isinstance(exc, (TimeoutError, ConnectionError)):
            return True
        if isinstance(exc, urllib.error.HTTPError):
            # 5xx e 429 valem retry; 4xx (exceto 429) não.
            return exc.code >= 500 or exc.code == 429
        if isinstance(exc, urllib.error.URLError):
            return True
        return False

    @staticmethod
    def _parse_json(content: str) -> dict:
        content = content.strip()
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', content, re.S)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass
        return {'visualSummary': content[:500], 'confidence': 0.5}
