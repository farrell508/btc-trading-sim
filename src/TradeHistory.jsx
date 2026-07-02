import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const typeLabels = {
  open: "진입",
  add: "추가(물타기/불타기)",
  partial_close: "부분 청산",
  close: "전량 청산",
  liquidation: "강제 청산",
};

function TradeHistory({ uid }) {
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "trades"),
      where("uid", "==", uid),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setTrades(list);
    });

    return () => unsubscribe();
  }, [uid]);

  const formatTime = (timestamp) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day} ${hours}:${minutes}`;
  };

  if (!uid) {
    return (
      <div style={{ fontSize: "13px", color: "#848e9c", padding: "16px" }}>
        로그인이 필요합니다.
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div style={{ fontSize: "13px", color: "#848e9c", padding: "16px" }}>
        거래 내역이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ maxHeight: "400px", overflowY: "auto" }}>
      {trades.map((trade) => (
        <div
          key={trade.id}
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #1e2329",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ color: "#848e9c" }}>{formatTime(trade.timestamp)}</span>
            <span
              style={{
                color: trade.side === "long" ? "#0ecb81" : "#f6465d",
                fontWeight: "bold",
              }}
            >
              {trade.side === "long" ? "롱" : "숏"} · {typeLabels[trade.type] || trade.type}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#d1d4dc" }}>
            <span>
              ${trade.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })} ·{" "}
              {trade.size?.toFixed(6)} BTC · {trade.leverage?.toFixed(1)}x
            </span>
            {trade.pnl !== 0 && (
              <span style={{ color: trade.pnl >= 0 ? "#0ecb81" : "#f6465d", fontWeight: "bold" }}>
                {trade.pnl >= 0 ? "+" : ""}
                ${trade.pnl.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default TradeHistory;