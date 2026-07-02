import { db } from "./firebaseAdmin.js";
import { calcLiquidationPrice, calcUnrealizedPnl, calcNewAveragePrice } from "../../src/calc.js";
import { FieldValue } from "firebase-admin/firestore";

export default async (req) => {
  try {
    const body = await req.json();
    const { uid, side, marginUsd, leverage, currentPrice } = body;

    // ===== 입력값 검증 (서버에서 반드시 다시 확인) =====
    if (!uid || !side || !marginUsd || !leverage || !currentPrice) {
      return new Response(JSON.stringify({ error: "필수 값이 누락되었습니다." }), { status: 400 });
    }
    if (marginUsd <= 0) {
      return new Response(JSON.stringify({ error: "마진은 0보다 커야 합니다." }), { status: 400 });
    }
    if (leverage < 1 || leverage > 75) {
      return new Response(JSON.stringify({ error: "레버리지는 1~75 사이여야 합니다." }), { status: 400 });
    }

    const userRef = db.collection("users").doc(uid);
    const positionRef = db.collection("positions").doc(uid);

    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return new Response(JSON.stringify({ error: "유저 정보를 찾을 수 없습니다." }), { status: 404 });
    }
    const userData = userSnap.data();

    if (marginUsd > userData.balance) {
      return new Response(JSON.stringify({ error: "잔고가 부족합니다." }), { status: 400 });
    }

    const positionSnap = await positionRef.get();
    const addSize = (marginUsd * leverage) / currentPrice;
    const orderNotional = marginUsd * leverage;

    const nowIso = new Date().toISOString();

    if (positionSnap.exists && positionSnap.data().side === side) {
      // 같은 방향: 물타기/불타기
      const pos = positionSnap.data();
      const newSize = pos.size + addSize;
      const newEntryPrice = calcNewAveragePrice(pos.size, pos.entryPrice, addSize, currentPrice);
      const newMargin = pos.margin + marginUsd;
      const newLeverage = (newSize * currentPrice) / newMargin;
      const newLiqPrice = calcLiquidationPrice(side, newEntryPrice, newLeverage);

      await positionRef.update({
        size: newSize,
        entryPrice: newEntryPrice,
        margin: newMargin,
        leverage: newLeverage,
        liquidationPrice: newLiqPrice,
        updatedAt: nowIso,
        lastCheckedAt: nowIso,
      });
      await userRef.update({ balance: userData.balance - marginUsd });
      await addTradeRecord(uid, side, "add", currentPrice, addSize, leverage, 0);

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else if (positionSnap.exists && positionSnap.data().side !== side) {
      // 반대 방향: 상쇄/전환
      const pos = positionSnap.data();
      const existingNotional = pos.size * currentPrice;

      if (orderNotional < existingNotional) {
        const closeRatio = orderNotional / existingNotional;
        const closeSize = pos.size * closeRatio;
        const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, closeSize);
        const returnedMargin = pos.margin * closeRatio;

        await positionRef.update({
          size: pos.size - closeSize,
          margin: pos.margin - returnedMargin,
          updatedAt: nowIso,
          lastCheckedAt: nowIso,
        });
        await userRef.update({ balance: userData.balance + returnedMargin + pnl });
        await addTradeRecord(uid, pos.side, "partial_close", currentPrice, closeSize, pos.leverage, pnl);
      } else if (orderNotional === existingNotional) {
        const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, pos.size);
        await positionRef.delete();
        await userRef.update({ balance: userData.balance + pos.margin + pnl });
        await addTradeRecord(uid, pos.side, "close", currentPrice, pos.size, pos.leverage, pnl);
      } else {
        const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, pos.size);
        const usedMarginForOffset = pos.margin;
        const remainingNotional = orderNotional - existingNotional;
        const newSize = remainingNotional / currentPrice;
        const newMarginForNewPosition = marginUsd + usedMarginForOffset + pnl;
        const newLiqPrice = calcLiquidationPrice(side, currentPrice, leverage);

        await positionRef.delete();
        await positionRef.set({
          side,
          size: newSize,
          entryPrice: currentPrice,
          margin: newMarginForNewPosition,
          leverage,
          liquidationPrice: newLiqPrice,
          updatedAt: nowIso,
          lastCheckedAt: nowIso,
        });
        await userRef.update({ balance: userData.balance - marginUsd });
        await addTradeRecord(uid, pos.side, "close", currentPrice, pos.size, pos.leverage, pnl);
        await addTradeRecord(uid, side, "open", currentPrice, newSize, leverage, 0);
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      // 포지션 없음: 새로 생성
      const liqPrice = calcLiquidationPrice(side, currentPrice, leverage);

      await positionRef.set({
        side,
        size: addSize,
        entryPrice: currentPrice,
        margin: marginUsd,
        leverage,
        liquidationPrice: liqPrice,
        updatedAt: nowIso,
        lastCheckedAt: nowIso,
      });
      await userRef.update({ balance: userData.balance - marginUsd });
      await addTradeRecord(uid, side, "open", currentPrice, addSize, leverage, 0);

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
  } catch (error) {
    console.error("주문 처리 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

async function addTradeRecord(uid, side, type, price, size, leverage, pnl) {
  await db.collection("trades").add({
    uid,
    side,
    type,
    price,
    size,
    leverage,
    pnl,
    timestamp: FieldValue.serverTimestamp(),
  });
}