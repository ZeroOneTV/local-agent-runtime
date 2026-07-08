import base64
import io
import json
import re
import time
import urllib.request
from typing import TYPE_CHECKING

from app.config import ENABLE_VLM, VLM_BASE_URL, VLM_MAX_IMAGE_SIZE, VLM_MODEL, VLM_PROVIDER
from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image


class OllamaVisionProvider(BaseProvider):
    name = 'ollama-vlm'

    def is_enabled(self) -> bool:
        return ENABLE_VLM and VLM_PROVIDER == 'ollama'

    def is_available(self) -> bool:
        if not self.is_enabled():
            return False
        try:
            req = urllib.request.Request(f'{VLM_BASE_URL}/api/tags', method='GET')
            with urllib.request.urlopen(req, timeout=3) as resp:
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
        img = image.copy()
        img.thumbnail((VLM_MAX_IMAGE_SIZE, VLM_MAX_IMAGE_SIZE))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85)
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
        prompt = (
            'Analyze this image and respond ONLY with valid JSON: '
            '{"visualSummary":"...","imageType":"...","objects":[],"uiElements":[],'
            '"relationships":[],"charts":[],"potentialIssues":[],"confidence":0.0}'
        )

        payload = {
            'model': VLM_MODEL,
            'messages': [{'role': 'user', 'content': prompt, 'images': [self._prepare_image(image)]}],
            'stream': False,
        }

        try:
            req = urllib.request.Request(
                f'{VLM_BASE_URL}/api/chat',
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = json.loads(resp.read().decode('utf-8'))
            content = body.get('message', {}).get('content', '')
            parsed = self._parse_json(content)
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
                duration_ms=int((time.time() - started) * 1000),
            )
        except Exception as exc:
            warnings.append(f'Ollama VLM failed: {exc}')
            return ProviderResult(
                provider='failed',
                warnings=warnings,
                data={'enabled': False, 'summary': None, 'objects': [], 'uiElements': [], 'relationships': []},
                duration_ms=int((time.time() - started) * 1000),
            )

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
