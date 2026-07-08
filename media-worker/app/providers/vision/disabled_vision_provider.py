import time
from typing import TYPE_CHECKING

from app.providers.base import BaseProvider, ProviderResult

if TYPE_CHECKING:
    from PIL import Image


class DisabledVisionProvider(BaseProvider):
    name = 'disabled'

    def is_enabled(self) -> bool:
        return True

    def is_available(self) -> bool:
        return True

    def process(self) -> ProviderResult:
        return ProviderResult(
            provider='disabled',
            data={
                'enabled': False,
                'summary': None,
                'objects': [],
                'uiElements': [],
                'relationships': [],
            },
        )
