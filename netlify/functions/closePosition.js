import { db } from "./firebaseAdmin.js";
import { calcUnrealizedPnl } from "../../src/calc.js";
import { FieldValue } from "firebase-admin/firestore";

export default async (req) => {
  try {
    const body = await req.json();
    const { uid, closeRatio, currentPrice } = body;

    if (!uid || !closeRatio || !currentPrice) {
      return new Response(JSON.stringify({ error: "필수 값이 누락되었습니다." }), { status: 400 });
    }
    if (closeRatio <= 0 || closeRatio > 1) {
      return new Response(JSON.stringify({ error: "청산 비율이 올바르지 않습니다." }), { status: 400 });
    }

    const userRef = db.collection("users").doc(uid);
    const positionRef = db.collection("positions").doc(uid);

    const userSnap = await userRef.get();
    const positionSnap = await positionRef.get();

    if (!positionSnap.exists) {
      return new Response(JSON.stringify({ error: "청산할 포지션이 없습니다." }), { status: 400 });
    }

    const pos = positionSnap.data();
    const userData = userSnap.data();

    const closeSize = pos.size * closeRatio;
    const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, closeSize);
    const returnedMargin = pos.margin * closeRatio;
    const newBalance = userData.balance + returnedMargin + pnl;

    if (closeRatio >= 1) {
      await positionRef.delete();
    } else {
      await positionRef.update({
        size: pos.size - closeSize,
        margin: pos.margin - returnedMargin,
        updatedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
      });
    }

    await userRef.update({ balance: newBalance });

    await db.collection("trades").add({
      uid,
      side: pos.side,
      type: closeRatio >= 1 ? "close" : "partial_close",
      price: currentPrice,
      size: closeSize,
      leverage: pos.leverage,
      pnl,
      timestamp: FieldValue.serverTimestamp(),
    });

    return new Response(JSON.stringify({ success: true, pnl }), { status: 200 });
  } catch (error) {
    console.error("청산 처리 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};