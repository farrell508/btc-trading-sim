import { db } from "./firebaseAdmin.js";
import { calcLiquidationPrice, calcUnrealizedPnl, calcNewAveragePrice } from "../../src/calc.js";
import { FieldValue } from "firebase-admin/firestore";

export default async (req) => {
  try {
    const body = await req.json();
    const { uid, side, marginUsd, leverage, currentPrice } = body;

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

    // 유저 정보와 포지션 정보를 동시에 읽기 (순차적으로 기다리지 않음)
    const [userSnap, positionSnap] = await Promise.all([userRef.get(), positionRef.get()]);

    if (!userSnap.exists) {
      return new Response(JSON.stringify({ error: "유저 정보를 찾을 수 없습니다." }), { status: 404 });
    }
    const userData = userSnap.data();

    if (marginUsd > userData.balance) {
      return new Response(JSON.stringify({ error: "잔고가 부족합니다." }), { status: 400 });
    }

    const addSize = (marginUsd * leverage) / currentPrice;
    const orderNotional = marginUsd * leverage;
    const nowIso = new Date().toISOString();

    const batch = db.batch(); // 여러 쓰기 작업을 하나로 묶기 위한 배치

    if (positionSnap.exists && positionSnap.data().side === side) {
      // 같은 방향: 물타기/불타기
      const pos = positionSnap.data();
      const newSize = pos.size + addSize;
      const newEntryPrice = calcNewAveragePrice(pos.size, pos.entryPrice, addSize, currentPrice);
      const newMargin = pos.margin + marginUsd;
      const newLeverage = (newSize * currentPrice) / newMargin;
      const newLiqPrice = calcLiquidationPrice(side, newEntryPrice, newLeverage);

      batch.update(positionRef, {
        size: newSize,
        entryPrice: newEntryPrice,
        margin: newMargin,
        leverage: newLeverage,
        liquidationPrice: newLiqPrice,
        updatedAt: nowIso,
        lastCheckedAt: nowIso,
      });
      batch.update(userRef, { balance: userData.balance - marginUsd });
      batch.create(db.collection("trades").doc(), {
        uid, side, type: "add", price: currentPrice, size: addSize, leverage,
        pnl: 0, timestamp: FieldValue.serverTimestamp(),
      });

      await batch.commit();
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

        batch.update(positionRef, {
          size: pos.size - closeSize,
          margin: pos.margin - returnedMargin,
          updatedAt: nowIso,
          lastCheckedAt: nowIso,
        });
        batch.update(userRef, { balance: userData.balance + returnedMargin + pnl });
        batch.create(db.collection("trades").doc(), {
          uid, side: pos.side, type: "partial_close", price: currentPrice, size: closeSize,
          leverage: pos.leverage, pnl, timestamp: FieldValue.serverTimestamp(),
        });
      } else if (orderNotional === existingNotional) {
        const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, pos.size);

        batch.delete(positionRef);
        batch.update(userRef, { balance: userData.balance + pos.margin + pnl });
        batch.create(db.collection("trades").doc(), {
          uid, side: pos.side, type: "close", price: currentPrice, size: pos.size,
          leverage: pos.leverage, pnl, timestamp: FieldValue.serverTimestamp(),
        });
      } else {
        const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, pos.size);
        const usedMarginForOffset = pos.margin;
        const remainingNotional = orderNotional - existingNotional;
        const newSize = remainingNotional / currentPrice;
        const newMarginForNewPosition = marginUsd + usedMarginForOffset + pnl;
        const newLiqPrice = calcLiquidationPrice(side, currentPrice, leverage);

        batch.set(positionRef, {
          side, size: newSize, entryPrice: currentPrice, margin: newMarginForNewPosition,
          leverage, liquidationPrice: newLiqPrice, updatedAt: nowIso, lastCheckedAt: nowIso,
        });
        batch.update(userRef, { balance: userData.balance - marginUsd });
        batch.create(db.collection("trades").doc(), {
          uid, side: pos.side, type: "close", price: currentPrice, size: pos.size,
          leverage: pos.leverage, pnl, timestamp: FieldValue.serverTimestamp(),
        });
        batch.create(db.collection("trades").doc(), {
          uid, side, type: "open", price: currentPrice, size: newSize,
          leverage, pnl: 0, timestamp: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      // 포지션 없음: 새로 생성
      const liqPrice = calcLiquidationPrice(side, currentPrice, leverage);

      batch.set(positionRef, {
        side, size: addSize, entryPrice: currentPrice, margin: marginUsd,
        leverage, liquidationPrice: liqPrice, updatedAt: nowIso, lastCheckedAt: nowIso,
      });
      batch.update(userRef, { balance: userData.balance - marginUsd });
      batch.create(db.collection("trades").doc(), {
        uid, side, type: "open", price: currentPrice, size: addSize,
        leverage, pnl: 0, timestamp: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
  } catch (error) {
    console.error("주문 처리 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};