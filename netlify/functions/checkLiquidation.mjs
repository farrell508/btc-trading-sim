import { db } from "./firebaseAdmin.mjs";
import { FieldValue } from "firebase-admin/firestore";

export default async (req) => {
  try {
    const body = await req.json();
    const { uid, candles } = body; // candles: 클라이언트가 미리 가져온 캔들 배열

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

    // 클라이언트가 보낸 캔들 중, "마지막 체크 이후" 구간만 필터링해서 검사
    const relevantCandles = (candles || []).filter(
      (c) => c.time * 1000 >= lastChecked && c.time * 1000 <= now
    );

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