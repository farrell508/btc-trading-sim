export async function placeOrderRequest(uid, side, marginUsd, leverage, currentPrice) {
  const response = await fetch("/.netlify/functions/placeOrder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, side, marginUsd, leverage, currentPrice }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "주문 처리 중 오류가 발생했습니다.");
  }
  return data;
}

export async function closePositionRequest(uid, closeRatio, currentPrice) {
  const response = await fetch("/.netlify/functions/closePosition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, closeRatio, currentPrice }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "청산 처리 중 오류가 발생했습니다.");
  }
  return data;
}

export async function checkLiquidationRequest(uid) {
  const response = await fetch("/.netlify/functions/checkLiquidation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "청산 체크 중 오류가 발생했습니다.");
  }
  return data;
}
export async function initUserRequest(uid, displayName, email) {
  const response = await fetch("/.netlify/functions/initUser", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, displayName, email }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "유저 초기화 중 오류가 발생했습니다.");
  }
  return data;
}