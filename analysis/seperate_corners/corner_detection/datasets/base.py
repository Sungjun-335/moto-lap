from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict

import pandas as pd


@dataclass(frozen=True)
class DatasetLoadResult:
    df: pd.DataFrame
    metadata: Dict[str, str]
    sampling_rate_hz: float


class BaseDataset(ABC):
    @abstractmethod
    def load(self) -> DatasetLoadResult:
        raise NotImplementedError

