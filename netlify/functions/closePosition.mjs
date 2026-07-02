import { db } from "./firebaseAdmin.mjs";
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

    const [userSnap, positionSnap] = await Promise.all([userRef.get(), positionRef.get()]);

    if (!positionSnap.exists) {
      return new Response(JSON.stringify({ error: "청산할 포지션이 없습니다." }), { status: 400 });
    }

    const pos = positionSnap.data();
    const userData = userSnap.data();

    const closeSize = pos.size * closeRatio;
    const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, closeSize);
    const returnedMargin = pos.margin * closeRatio;
    const newBalance = userData.balance + returnedMargin + pnl;

    const batch = db.batch();

    if (closeRatio >= 1) {
      batch.delete(positionRef);
    } else {
      batch.update(positionRef, {
        size: pos.size - closeSize,
        margin: pos.margin - returnedMargin,
        updatedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
      });
    }

    batch.update(userRef, { balance: newBalance });
    batch.create(db.collection("trades").doc(), {
      uid,
      side: pos.side,
      type: closeRatio >= 1 ? "close" : "partial_close",
      price: currentPrice,
      size: closeSize,
      leverage: pos.leverage,
      pnl,
      timestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return new Response(JSON.stringify({ success: true, pnl }), { status: 200 });
  } catch (error) {
    console.error("청산 처리 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
export const config = {
  region: "nrt",
};