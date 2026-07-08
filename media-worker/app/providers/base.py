from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ProviderResult:
    provider: str
    version: str = '1.0'
    data: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    duration_ms: int = 0


class BaseProvider(ABC):
    name: str = 'base'

    @abstractmethod
    def is_enabled(self) -> bool:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    def get_version(self) -> str:
        return '1.0'

    def get_resource_cost(self) -> str:
        return 'low'
