import { useState } from "react";
import { placeOrderRequest } from "./api";

function TradePanel({ uid, balance, currentPrice, position, showToast }) {
  const [leverage, setLeverage] = useState(1);
  const [marginAmount, setMarginAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const positionSize = marginAmount ? (parseFloat(marginAmount) * leverage).toFixed(2) : "0.00";

  // 잔고 대비 몇 %를 마진으로 쓰고 있는지 (슬라이더 표시용)
  const percentOfBalance =
    balance && balance > 0 && marginAmount
      ? Math.min(100, (parseFloat(marginAmount) / balance) * 100)
      : 0;

  // 슬라이더나 퍼센트 버튼을 움직였을 때, 그 비율만큼의 금액을 마진 입력창에 반영
  const setMarginByPercent = (percent) => {
    if (!balance) return;
    const amount = (balance * percent) / 100;
    const flooredAmount = Math.floor(amount * 100) / 100;
    setMarginAmount(flooredAmount.toFixed(2));
  };

  const estimateLiquidation = (side) => {
    if (!currentPrice || !marginAmount || leverage <= 1) return null;
    const liqRatio = 1 / leverage - 0.005;
    if (side === "long") {
      return (currentPrice * (1 - liqRatio)).toFixed(2);
    } else {
      return (currentPrice * (1 + liqRatio)).toFixed(2);
    }
  };

  const handleTrade = async (side) => {
    if (!uid) {
      showToast("로그인이 필요합니다.", "error");
      return;
    }
    if (!marginAmount || parseFloat(marginAmount) <= 0) {
      showToast("투입할 마진 금액을 입력해주세요.", "error");
      return;
    }
    if (!currentPrice) {
      showToast("가격 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.", "error");
      return;
    }

    setLoading(true);
    try {
      await placeOrderRequest(uid, side, parseFloat(marginAmount), leverage, currentPrice);
      setMarginAmount("");
      showToast(`${side === "long" ? "롱" : "숏"} 포지션이 체결되었습니다.`, "success");
    } catch (error) {
      showToast("주문 실패: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: "300px",
        backgroundColor: "#161a1e",
        color: "#eaecef",
        padding: "16px",
        borderRadius: "8px",
        fontFamily: "sans-serif",
      }}
    >
      <h3 style={{ marginTop: 0 }}>주문</h3>

      <p style={{ fontSize: "13px", color: "#848e9c" }}>
        사용 가능 잔고: ${balance !== null ? balance.toLocaleString() : "-"}
      </p>

      <div style={{ marginBottom: "16px" }}>
        <label style={{ fontSize: "13px", color: "#848e9c" }}>레버리지: {leverage}x</label>
        <input
          type="range"
          min="1"
          max="75"
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <input
          type="number"
          min="1"
          max="75"
          value={leverage}
          onChange={(e) => {
            const val = Math.min(75, Math.max(1, Number(e.target.value)));
            setLeverage(val);
          }}
          style={{
            width: "60px",
            marginTop: "4px",
            backgroundColor: "#0b0e11",
            color: "#eaecef",
            border: "1px solid #2b3139",
            borderRadius: "4px",
            padding: "4px",
          }}
        />
      </div>

      <div style={{ marginBottom: "8px" }}>
        <label style={{ fontSize: "13px", color: "#848e9c" }}>투입 마진 (USD)</label>
        <input
          type="number"
          placeholder="예: 100"
          value={marginAmount}
          onChange={(e) => setMarginAmount(e.target.value)}
          style={{
            width: "100%",
            padding: "8px",
            backgroundColor: "#0b0e11",
            color: "#eaecef",
            border: "1px solid #2b3139",
            borderRadius: "4px",
            marginTop: "4px",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* 잔고 대비 % 슬라이더 */}
      <div style={{ marginBottom: "8px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#848e9c",
            marginBottom: "2px",
          }}
        >
          <span>잔고의 {percentOfBalance.toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={percentOfBalance}
          onChange={(e) => setMarginByPercent(Number(e.target.value))}
          style={{ width: "100%" }}
        />

        {/* 25/50/75/100% 빠른 선택 버튼 */}
        <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              onClick={() => setMarginByPercent(p)}
              style={{
                flex: 1,
                padding: "6px",
                fontSize: "12px",
                backgroundColor: "#2b3139",
                color: "#eaecef",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      <p style={{ fontSize: "13px", color: "#848e9c" }}>포지션 규모: ${positionSize}</p>

      {position && (
        <p style={{ fontSize: "12px", color: "#f0b90b" }}>
          현재 {position.side === "long" ? "롱" : "숏"} 포지션 보유 중 — 같은 방향으로 주문하면
          물타기/불타기가 됩니다.
        </p>
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <button
          onClick={() => handleTrade("long")}
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px",
            backgroundColor: "#0ecb81",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          롱 (매수)
        </button>
        <button
          onClick={() => handleTrade("short")}
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px",
            backgroundColor: "#f6465d",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          숏 (매도)
        </button>
      </div>

      {leverage > 1 && marginAmount && (
        <div style={{ marginTop: "16px", fontSize: "12px", color: "#848e9c" }}>
          <p>예상 청산가 (롱): ${estimateLiquidation("long")}</p>
          <p>예상 청산가 (숏): ${estimateLiquidation("short")}</p>
        </div>
      )}
    </div>
  );
}

export default TradePanel;