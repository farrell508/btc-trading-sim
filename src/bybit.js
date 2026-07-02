// Bybit 공개 API에서 BTC/USDT 현재가를 가져오는 함수
export async function fetchBtcPrice() {
  try {
    const response = await fetch(
      "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT"
    );
    const data = await response.json();

    if (data.retCode === 0) {
      const ticker = data.result.list[0];
      return {
        price: parseFloat(ticker.lastPrice),
        timestamp: Date.now(),
      };
    } else {
      throw new Error("Bybit API 에러: " + data.retMsg);
    }
  } catch (error) {
    console.error("가격 가져오기 실패:", error);
    return null;
  }
}

// 최초 로딩용: 최근 캔들 데이터 가져오기 (1분봉, 최근 200개)
export async function fetchKlines() {
  try {
    const response = await fetch(
      "https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&limit=200"
    );
    const data = await response.json();

    if (data.retCode === 0) {
      const candles = data.result.list
        .map((item) => ({
          time: Math.floor(parseInt(item[0]) / 1000),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
        }))
        .reverse();
      return candles;
    } else {
      throw new Error("Bybit API 에러: " + data.retMsg);
    }
  } catch (error) {
    console.error("캔들 데이터 가져오기 실패:", error);
    return [];
  }
}

// 무한스크롤용: 특정 시점(endTimeMs) 이전의 과거 캔들 200개 추가로 가져오기
export async function fetchOlderKlines(endTimeMs) {
  try {
    const response = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&end=${endTimeMs}&limit=200`
    );
    const data = await response.json();

    if (data.retCode === 0) {
      const candles = data.result.list
        .map((item) => ({
          time: Math.floor(parseInt(item[0]) / 1000),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
        }))
        .reverse();
      return candles;
    } else {
      throw new Error("Bybit API 에러: " + data.retMsg);
    }
  } catch (error) {
    console.error("과거 캔들 데이터 가져오기 실패:", error);
    return [];
  }
}