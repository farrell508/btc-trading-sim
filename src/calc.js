export function calcLiquidationPrice(side, entryPrice, leverage) {
  const maintenanceMarginRate = 0.005;
  const liqRatio = 1 / leverage - maintenanceMarginRate;

  if (side === "long") {
    return entryPrice * (1 - liqRatio);
  } else {
    return entryPrice * (1 + liqRatio);
  }
}

export function calcUnrealizedPnl(side, entryPrice, currentPrice, size) {
  if (side === "long") {
    return (currentPrice - entryPrice) * size;
  } else {
    return (entryPrice - currentPrice) * size;
  }
}

export function calcNewAveragePrice(oldSize, oldEntryPrice, addSize, addPrice) {
  const totalSize = oldSize + addSize;
  return (oldSize * oldEntryPrice + addSize * addPrice) / totalSize;
}