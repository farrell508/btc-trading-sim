import { db } from "./firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

async function fetchKlinesForRange(startTimeMs, endTimeMs) {
  try {
    const response = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=1&start=${startTimeMs}&end=${endTimeMs}&limit=1000`
    );
    const data = await response.json();
    if (data.retCode === 0) {
      return data.result.list
        .map((item) => ({
          time: parseInt(item[0]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
        }))
        .reverse();
    }
    return [];
  } catch (error) {
    console.error("청산 체크용 캔들 조회 실패:", error);
    return [];
  }
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

    const candles = await fetchKlinesForRange(lastChecked, now);

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