import time
from pathlib import Path
from typing import TYPE_CHECKING

from app.config import DOCLING_ONLY_FOR_DOCUMENTS, ENABLE_DOCLING
from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image


class DoclingProvider(BaseProvider):
    name = 'docling'

    def is_enabled(self) -> bool:
        return ENABLE_DOCLING

    def is_available(self) -> bool:
        try:
            import docling  # noqa: F401
            return True
        except Exception:
            return False

    def get_resource_cost(self) -> str:
        return 'high'

    def should_run(self, image_type: str, mode: str) -> bool:
        if not self.is_enabled() or mode != 'full':
            return False
        if DOCLING_ONLY_FOR_DOCUMENTS:
            return image_type in ('scanned_document', 'document_scan', 'chart_table', 'chart')
        return True

    def process(self, image_path: Path, image_type: str, mode: str) -> ProviderResult:
        started = time.time()
        if not self.should_run(image_type, mode):
            return ProviderResult(
                provider='skipped',
                data={'markdown': None, 'tables': []},
            )

        if not self.is_available():
            return ProviderResult(
                provider='unavailable',
                warnings=['Docling not installed; skipping document parsing'],
                data={'markdown': None, 'tables': []},
            )

        warnings: list[str] = []
        try:
            from docling.document_converter import DocumentConverter

            converter = DocumentConverter()
            result = converter.convert(str(image_path))
            markdown = result.document.export_to_markdown()
            tables: list[str] = []
            if markdown and '|' in markdown:
                tables = [line for line in markdown.split('\n') if '|' in line][:20]

            return ProviderResult(
                provider=self.name,
                data={'markdown': markdown, 'tables': tables},
                duration_ms=int((time.time() - started) * 1000),
            )
        except Exception as exc:
            warnings.append(f'Docling failed: {exc}')
            return ProviderResult(
                provider='failed',
                warnings=warnings,
                data={'markdown': None, 'tables': []},
                duration_ms=int((time.time() - started) * 1000),
            )
