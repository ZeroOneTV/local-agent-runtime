import re
import time
from typing import TYPE_CHECKING

from app.config import ENABLE_PP_STRUCTURE
from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image


class HeuristicLayoutProvider(BaseProvider):
    name = 'heuristic-ocr'

    def is_enabled(self) -> bool:
        return True

    def is_available(self) -> bool:
        return True

    def process_from_ocr_blocks(self, ocr_blocks: list[dict]) -> ProviderResult:
        started = time.time()
        layout: list[dict] = []
        for block in ocr_blocks[:30]:
            text = block.get('text', '')
            block_type = 'paragraph'
            if re.search(r'error|exception|traceback', text, re.I):
                block_type = 'error_message'
            elif re.search(r'^\s*def |class |function |import ', text):
                block_type = 'code'
            elif re.search(r'\|\s*.+\s*\|', text):
                block_type = 'table'
            layout.append({
                'type': block_type,
                'content': text,
                'bbox': block.get('bbox'),
                'confidence': block.get('confidence'),
            })
        return ProviderResult(
            provider=self.name,
            data={'blocks': layout},
            duration_ms=int((time.time() - started) * 1000),
        )


class PaddleStructureProvider(BaseProvider):
    name = 'pp-structure'

    def is_enabled(self) -> bool:
        return ENABLE_PP_STRUCTURE

    def is_available(self) -> bool:
        try:
            from paddleocr import PPStructure  # noqa: F401
            return True
        except Exception:
            return False

    def get_resource_cost(self) -> str:
        return 'high'

    def process(self, image: 'Image.Image', ocr_blocks: list[dict], mode: str) -> ProviderResult:
        if not self.is_enabled():
            return HeuristicLayoutProvider().process_from_ocr_blocks(ocr_blocks)

        if mode == 'fast' or not self.is_available():
            result = HeuristicLayoutProvider().process_from_ocr_blocks(ocr_blocks)
            if not self.is_available():
                result.warnings.append('PP-Structure unavailable; using heuristic layout from OCR blocks')
            return result

        started = time.time()
        warnings: list[str] = []
        try:
            import numpy as np
            from paddleocr import PPStructure

            engine = PPStructure(show_log=False)
            raw = engine(np.array(image.convert('RGB')))
            blocks: list[dict] = []
            for item in raw or []:
                block_type = item.get('type', 'unknown')
                content = item.get('res', {})
                if isinstance(content, dict):
                    text = content.get('text') or str(content)[:500]
                else:
                    text = str(content)[:500]
                blocks.append({
                    'type': block_type,
                    'content': text,
                    'bbox': item.get('bbox'),
                    'confidence': None,
                })
            if blocks:
                return ProviderResult(
                    provider=self.name,
                    data={'blocks': blocks},
                    duration_ms=int((time.time() - started) * 1000),
                )
        except Exception as exc:
            warnings.append(f'PP-Structure failed: {exc}')

        fallback = HeuristicLayoutProvider().process_from_ocr_blocks(ocr_blocks)
        fallback.warnings.extend(warnings)
        return fallback
