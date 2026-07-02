import { db } from "./firebaseAdmin.mjs";
import { FieldValue } from "firebase-admin/firestore";

export default async (req) => {
  try {
    const body = await req.json();
    const { uid, candles } = body;

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

    console.log(`side=${pos.side}, liqPrice=${pos.liquidationPrice}, lastChecked=${new Date(lastChecked).toISOString()}, now=${new Date(now).toISOString()}, 받은캔들수=${(candles || []).length}`);

    if (now - lastChecked < 1000) {
      return new Response(JSON.stringify({ liquidated: false }), { status: 200 });
    }

    const relevantCandles = (candles || []).filter(
      (c) => c.time * 1000 >= lastChecked && c.time * 1000 <= now
    );

    console.log(`필터링된 캔들 수=${relevantCandles.length}`);
    if (candles && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      console.log(`가장 최근 캔들 시각=${new Date(lastCandle.time * 1000).toISOString()}, high=${lastCandle.high}, low=${lastCandle.low}`);
    }

    for (const candle of relevantCandles) {
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
        console.log("청산 발생!");
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