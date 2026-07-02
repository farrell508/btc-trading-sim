import { useState } from "react";
import { calcUnrealizedPnl } from "./calc";
import { closePositionRequest } from "./api";



function PositionInfo({ position, currentPrice, uid, showToast }) {
  const [closing, setClosing] = useState(false);

  if (!position) {
    return (
      <div style={{ padding: "16px", fontFamily: "sans-serif" }}>
        <p style={{ fontSize: "13px", color: "#848e9c" }}>보유 중인 포지션이 없습니다.</p>
      </div>
    );
  }

  const pnl = currentPrice
    ? calcUnrealizedPnl(position.side, position.entryPrice, currentPrice, position.size)
    : 0;
  const pnlColor = pnl >= 0 ? "#0ecb81" : "#f6465d";

  // 투입 마진 대비 수익률 (%)
  const pnlPercent = position.margin > 0 ? (pnl / position.margin) * 100 : 0;

  const handleClose = async (ratio) => {
    if (!currentPrice) return;
    setClosing(true);
    try {
      const result = await closePositionRequest(uid, ratio, currentPrice);
      const realizedPnl = result.pnl;
      showToast(
        `${ratio >= 1 ? "전량" : "부분"} 청산 완료. 실현손익: $${realizedPnl.toFixed(2)}`,
        realizedPnl >= 0 ? "success" : "error"
      );
    } catch (error) {
      showToast("청산 실패: " + error.message, "error");
    } finally {
      setClosing(false);
    }
  };
  return (
    <div
      style={{
        backgroundColor: "#161a1e",
        color: "#eaecef",
        padding: "16px",
        borderRadius: "8px",
        marginTop: "16px",
        fontFamily: "sans-serif",
        width: "300px",
        boxSizing: "border-box",
      }}
    >
      <h3 style={{ marginTop: 0 }}>
        내 포지션 —{" "}
        <span style={{ color: position.side === "long" ? "#0ecb81" : "#f6465d" }}>
          {position.side === "long" ? "롱" : "숏"}
        </span>
      </h3>

      <p style={{ fontSize: "13px" }}>진입가(평단): ${position.entryPrice.toFixed(2)}</p>
      <p style={{ fontSize: "13px" }}>수량: {position.size.toFixed(6)} BTC</p>
      <p style={{ fontSize: "13px" }}>레버리지: {position.leverage.toFixed(1)}x</p>
      <p style={{ fontSize: "13px" }}>투입 마진: ${position.margin.toFixed(2)}</p>
      <p style={{ fontSize: "13px" }}>청산가: ${position.liquidationPrice.toFixed(2)}</p>
      <p style={{ fontSize: "14px", color: pnlColor, fontWeight: "bold" }}>
        미실현 손익: ${pnl.toFixed(2)} ({pnlPercent >= 0 ? "+" : ""}
        {pnlPercent.toFixed(2)}%)
      </p>

      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
        <button
          onClick={() => handleClose(0.5)}
          disabled={closing}
          style={{
            flex: 1,
            padding: "8px",
            backgroundColor: "#2b3139",
            color: "#eaecef",
            border: "none",
            borderRadius: "4px",
            cursor: closing ? "not-allowed" : "pointer",
          }}
        >
          50% 청산
        </button>
        <button
          onClick={() => handleClose(1)}
          disabled={closing}
          style={{
            flex: 1,
            padding: "8px",
            backgroundColor: "#f0b90b",
            color: "#000",
            border: "none",
            borderRadius: "4px",
            fontWeight: "bold",
            cursor: closing ? "not-allowed" : "pointer",
          }}
        >
          전량 청산
        </button>
      </div>
    </div>
  );
}

export default PositionInfo;