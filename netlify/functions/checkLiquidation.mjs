import { db } from "./firebaseAdmin.mjs";
import { FieldValue } from "firebase-admin/firestore";

// 1분봉은 최대 1000개까지 한 번에 가져올 수 있음 (1000분 = 약 16.6시간)
// 구간이 이보다 길면 여러 번 나눠서 요청
async function fetchKlinesForRange(startTimeMs, endTimeMs) {
  const allCandles = [];
  const oneMinuteMs = 60 * 1000;
  const maxCandlesPerRequest = 1000;
  const maxRangeMs = oneMinuteMs * maxCandlesPerRequest;

  let currentStart = startTimeMs;

  while (currentStart < endTimeMs) {
    const currentEnd = Math.min(currentStart + maxRangeMs, endTimeMs);

    try {
      const response = await fetch(
        `https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&start=${currentStart}&end=${currentEnd}&limit=1000`
      );

      const rawText = await response.text();
      console.log(`Bybit 응답 상태: ${response.status}, 내용 일부: ${rawText.substring(0, 300)}`);

      const data = JSON.parse(rawText);
      const data = await response.json();

      if (data.retCode === 0) {
        const candles = data.result.list
          .map((item) => ({
            time: parseInt(item[0]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
          }))
          .reverse();
        allCandles.push(...candles);
      } else {
        console.error("Bybit API 에러:", data.retMsg);
      }
    } catch (error) {
      console.error("청산 체크용 캔들 조회 실패:", error);
    }

    currentStart = currentEnd;
  }

  return allCandles;
}

export default async (req) => {
  try {
    const body = await req.json();
    const { uid } = body;

    if (!uid) {
      return new Response(JSON.stringify({ error: "uid가 필요합니다." }), { status: 400 });
    }

    const positionRef = db.collection("positions").doc(uid);
    const positionSnap = await positionRef.get();

    if (!positionSnap.exists) {
      return new Response(JSON.stringify({ liquidated: false }), { status: 200 });
    }

    const pos = positionSnap.data();
    const now = Date.now();
    const lastChecked = pos.lastCheckedAt ? new Date(pos.lastCheckedAt).getTime() : now;

    if (now - lastChecked < 1000) {
      return new Response(JSON.stringify({ liquidated: false }), { status: 200 });
    }

    console.log(`청산체크 시작: uid=${uid}, side=${pos.side}, liqPrice=${pos.liquidationPrice}, 구간=${new Date(lastChecked).toISOString()} ~ ${new Date(now).toISOString()}`);

    const candles = await fetchKlinesForRange(lastChecked, now);

    console.log(`가져온 캔들 개수: ${candles.length}`);
    if (candles.length > 0) {
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      console.log(`구간 내 최고가: ${Math.max(...highs)}, 최저가: ${Math.min(...lows)}`);
    }

    for (const candle of candles) {
      let hit = false;
      if (pos.side === "long" && candle.low <= pos.liquidationPrice) hit = true;
      else if (pos.side === "short" && candle.high >= pos.liquidationPrice) hit = true;

      if (hit) {
        await positionRef.delete();
        await db.collection("trades").add({
          uid,
          side: pos.side,
          type: "liquidation",
          price: pos.liquidationPrice,
          size: pos.size,
          leverage: pos.leverage,
          pnl: -pos.margin,
          timestamp: FieldValue.serverTimestamp(),
        });
        console.log(`청산 발생! 캔들 시각: ${new Date(candle.time).toISOString()}`);
        return new Response(
          JSON.stringify({ liquidated: true, price: pos.liquidationPrice }),
          { status: 200 }
        );
      }
    }

    await positionRef.update({ lastCheckedAt: new Date(now).toISOString() });
    return new Response(JSON.stringify({ liquidated: false }), { status: 200 });
  } catch (error) {
    console.error("청산 체크 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};