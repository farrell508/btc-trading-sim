import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// 레버리지 거래 관련 계산 함수 모음

// 청산가 계산
// long: 가격이 떨어지면 손실 -> entryPrice보다 낮은 곳이 청산가
// short: 가격이 오르면 손실 -> entryPrice보다 높은 곳이 청산가
export function calcLiquidationPrice(side, entryPrice, leverage) {
  // 유지 마진율은 실제 거래소마다 다르지만, 학습용으로 0.5%로 단순화
  const maintenanceMarginRate = 0.005;
  const liqRatio = 1 / leverage - maintenanceMarginRate;

  if (side === "long") {
    return entryPrice * (1 - liqRatio);
  } else {
    return entryPrice * (1 + liqRatio);
  }
}

// 미실현 손익(PnL) 계산
export function calcUnrealizedPnl(side, entryPrice, currentPrice, size) {
  // size는 BTC 수량
  if (side === "long") {
    return (currentPrice - entryPrice) * size;
  } else {
    return (entryPrice - currentPrice) * size;
  }
}

// 물타기/불타기: 기존 포지션에 추가 진입할 때 새로운 평단가 계산
// (가중평균 방식)
export function calcNewAveragePrice(oldSize, oldEntryPrice, addSize, addPrice) {
  const totalSize = oldSize + addSize;
  const newAvgPrice = (oldSize * oldEntryPrice + addSize * addPrice) / totalSize;
  return newAvgPrice;
}
// 포지션 열기 또는 추가하기 (물타기/불타기)
// side: "long" | "short", marginUsd: 투입할 마진(달러), leverage: 레버리지, currentPrice: 진입가격
export async function openOrAddPosition(uid, side, marginUsd, leverage, currentPrice) {
  const userRef = doc(db, "users", uid);
  const positionRef = doc(db, "positions", uid);

  const userSnap = await getDoc(userRef);
  const positionSnap = await getDoc(positionRef);

  const userData = userSnap.data();

  if (marginUsd > userData.balance) {
    throw new Error("잔고가 부족합니다.");
  }

  const addSize = (marginUsd * leverage) / currentPrice; // 이번 주문의 BTC 수량
  const orderNotional = marginUsd * leverage; // 이번 주문의 USD 규모

  if (positionSnap.exists() && positionSnap.data().side === side) {
    // ===== 같은 방향: 물타기/불타기 =====
    const pos = positionSnap.data();
    const newSize = pos.size + addSize;
    const newEntryPrice = calcNewAveragePrice(pos.size, pos.entryPrice, addSize, currentPrice);
    const newMargin = pos.margin + marginUsd;
    const newLeverage = (newSize * currentPrice) / newMargin;
    const newLiqPrice = calcLiquidationPrice(side, newEntryPrice, newLeverage);

    await updateDoc(positionRef, {
      size: newSize,
      entryPrice: newEntryPrice,
      margin: newMargin,
      leverage: newLeverage,
      liquidationPrice: newLiqPrice,
      updatedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    });

    await updateDoc(userRef, { balance: userData.balance - marginUsd });
    await addTradeRecord(uid, side, "add", currentPrice, addSize, leverage, 0);
  } else if (positionSnap.exists() && positionSnap.data().side !== side) {
    // ===== 반대 방향: 상쇄/전환 처리 =====
    const pos = positionSnap.data();
    const existingNotional = pos.size * currentPrice; // 기존 포지션의 현재 USD 규모

    if (orderNotional < existingNotional) {
      // 케이스 1: 기존 포지션 일부만 청산
      const closeRatio = orderNotional / existingNotional;
      const closeSize = pos.size * closeRatio;
      const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, closeSize);
      const returnedMargin = pos.margin * closeRatio;

      await updateDoc(positionRef, {
        size: pos.size - closeSize,
        margin: pos.margin - returnedMargin,
        updatedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
      });

      // 반환된 마진 + 실현손익 - 이번 반대 주문에 쓴 마진(마진은 새 주문에 쓰인게 아니라 상쇄에 쓰였으므로 반환)
      await updateDoc(userRef, { balance: userData.balance + returnedMargin + pnl });

      await addTradeRecord(uid, pos.side, "partial_close", currentPrice, closeSize, pos.leverage, pnl);
    } else if (orderNotional === existingNotional) {
      // 케이스 2: 기존 포지션 정확히 전량 청산
      const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, pos.size);

      await deleteDoc(positionRef);
      await updateDoc(userRef, { balance: userData.balance + pos.margin + pnl });

      await addTradeRecord(uid, pos.side, "close", currentPrice, pos.size, pos.leverage, pnl);
    } else {
      // 케이스 3: 기존 포지션 전량 청산 + 초과분으로 반대 방향 새 포지션 생성
      const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, pos.size);
      const usedMarginForOffset = pos.margin; // 기존 포지션에서 반환되는 마진

      const remainingNotional = orderNotional - existingNotional; // 상쇄 후 남는 주문 규모
      const newSize = remainingNotional / currentPrice;

      // 새 포지션 마진 = 사용자가 입력한 마진 그대로 + 기존에서 반환된 마진 + 실현손익
      const newMarginForNewPosition = marginUsd + usedMarginForOffset + pnl;
      const newLiqPrice = calcLiquidationPrice(side, currentPrice, leverage);

      await deleteDoc(positionRef);
      await setDoc(positionRef, {
        side,
        size: newSize,
        entryPrice: currentPrice,
        margin: newMarginForNewPosition,
        leverage,
        liquidationPrice: newLiqPrice,
        updatedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
      });

      // 잔고에서는 이번 주문에 사용한 marginUsd만 차감 (반환된 마진/pnl은 새 포지션 마진으로 들어갔으므로 잔고엔 안 더함)
      await updateDoc(userRef, {
        balance: userData.balance - marginUsd,
      });

      await addTradeRecord(uid, pos.side, "close", currentPrice, pos.size, pos.leverage, pnl);
      await addTradeRecord(uid, side, "open", currentPrice, newSize, leverage, 0);
    }
  } else {
    // ===== 포지션이 없는 상태: 새로 생성 =====
    const liqPrice = calcLiquidationPrice(side, currentPrice, leverage);

    await setDoc(positionRef, {
      side,
      size: addSize,
      entryPrice: currentPrice,
      margin: marginUsd,
      leverage,
      liquidationPrice: liqPrice,
      updatedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    });

    await updateDoc(userRef, { balance: userData.balance - marginUsd });
    await addTradeRecord(uid, side, "open", currentPrice, addSize, leverage, 0);
  }
}

// 포지션 청산 (부분 또는 전량)
// closeRatio: 0~1 사이 값 (1이면 전량청산, 0.5면 절반청산)
export async function closePosition(uid, closeRatio, currentPrice) {
  const userRef = doc(db, "users", uid);
  const positionRef = doc(db, "positions", uid);

  const userSnap = await getDoc(userRef);
  const positionSnap = await getDoc(positionRef);

  if (!positionSnap.exists()) {
    throw new Error("청산할 포지션이 없습니다.");
  }

  const pos = positionSnap.data();
  const userData = userSnap.data();

  const closeSize = pos.size * closeRatio;
  const pnl = calcUnrealizedPnl(pos.side, pos.entryPrice, currentPrice, closeSize);
  const returnedMargin = pos.margin * closeRatio; // 청산한 비율만큼 마진 반환

  const newBalance = userData.balance + returnedMargin + pnl;

  if (closeRatio >= 1) {
    // 전량 청산 -> 포지션 문서 삭제
    await deleteDoc(positionRef);
  } else {
    // 부분 청산 -> 남은 수량/마진으로 갱신 (평단가와 레버리지는 유지)
    await updateDoc(positionRef, {
      size: pos.size - closeSize,
      margin: pos.margin - returnedMargin,
      updatedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    });
  }

  await updateDoc(userRef, { balance: newBalance });

  await addTradeRecord(
    uid,
    pos.side,
    closeRatio >= 1 ? "close" : "partial_close",
    currentPrice,
    closeSize,
    pos.leverage,
    pnl
  );

  return pnl;
}

// 체결 기록 저장
async function addTradeRecord(uid, side, type, price, size, leverage, pnl) {
  await addDoc(collection(db, "trades"), {
    uid,
    side,
    type,
    price,
    size,
    leverage,
    pnl,
    timestamp: serverTimestamp(),
  });
}


// 유저 설정 가져오기 (없으면 기본값 반환)
export async function getUserSettings(uid) {
  const settingsRef = doc(db, "settings", uid);
  const snap = await getDoc(settingsRef);
  if (snap.exists()) {
    return snap.data();
  } else {
    return { showLiquidationLine: true, showAvgPriceLine: true };
  }
}

// 유저 설정 저장하기
export async function saveUserSettings(uid, settings) {
  const settingsRef = doc(db, "settings", uid);
  await setDoc(settingsRef, settings, { merge: true });
}

// 특정 구간(startTimeMs ~ endTimeMs)의 1분 캔들을 가져와서 청산 여부를 검사하는 함수
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
        .reverse(); // 오래된 것부터 정렬
    }
    return [];
  } catch (error) {
    console.error("청산 체크용 캔들 조회 실패:", error);
    return [];
  }
}

// 강제 청산 체크 (catch-up 방식)
// 반환값: 청산이 발생했으면 { liquidated: true, price, time }, 아니면 { liquidated: false }
export async function checkLiquidation(uid) {
  const positionRef = doc(db, "positions", uid);
  const positionSnap = await getDoc(positionRef);

  if (!positionSnap.exists()) {
    return { liquidated: false };
  }

  const pos = positionSnap.data();
  const now = Date.now();

  // 마지막 체크 시각이 없으면 (예: 방금 포지션을 열었으면) 지금 시각으로 초기화하고 종료
  const lastChecked = pos.lastCheckedAt ? new Date(pos.lastCheckedAt).getTime() : now;

  if (now - lastChecked < 1000) {
    // 너무 짧은 간격이면 그냥 넘어감 (중복 방지)
    return { liquidated: false };
  }

  const candles = await fetchKlinesForRange(lastChecked, now);

  for (const candle of candles) {
    let hit = false;
    if (pos.side === "long" && candle.low <= pos.liquidationPrice) {
      hit = true;
    } else if (pos.side === "short" && candle.high >= pos.liquidationPrice) {
      hit = true;
    }

    if (hit) {
      // 청산 발생 -> 정산 처리
      const userRef = doc(db, "users", uid);
      // 청산되면 마진 전액 소실 (실현손익 = -마진, 반환금액 0)
      await deleteDoc(positionRef);
      await addTradeRecord(
        uid,
        pos.side,
        "liquidation",
        pos.liquidationPrice,
        pos.size,
        pos.leverage,
        -pos.margin
      );
      // 잔고는 이미 진입 시 마진이 차감되어 있었으므로, 청산 시에는 추가로 뺄 것 없음 (마진 전액 소실)
      return { liquidated: true, price: pos.liquidationPrice, time: candle.time };
    }
  }

  // 청산 안 됐으면 lastCheckedAt만 갱신
  await updateDoc(positionRef, { lastCheckedAt: new Date(now).toISOString() });
  return { liquidated: false };
}