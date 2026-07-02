import { useState, useEffect, useRef } from "react";
import { auth, googleProvider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { fetchBtcPrice, fetchKlines } from "./bybit";
import PriceChart from "./PriceChart";
import TradePanel from "./TradePanel";
import PositionInfo from "./PositionInfo";
import ToastContainer from "./ToastContainer";
import SettingsPanel from "./SettingsPanel";
import { getUserSettings, saveUserSettings } from "./tradingLogic";
import { checkLiquidationRequest } from "./api";
import TradeHistory from "./TradeHistory";
import { initUserRequest } from "./api";

function App() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(null);
  const [btcPrice, setBtcPrice] = useState(null);
  const [candles, setCandles] = useState([]);
  const [position, setPosition] = useState(null); // 현재 열려있는 포지션 (없으면 null)
  const [toasts, setToasts] = useState([]);
  const [settings, setSettings] = useState({ showLiquidationLine: true, showAvgPriceLine: true });
  const [activeTab, setActiveTab] = useState("position"); // "position" | "history"
  const isCheckingLiquidation = useRef(false);
  const showToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };
  // 로그인 상태 감지 + Firestore 유저 데이터 로드/생성
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          await initUserRequest(currentUser.uid, currentUser.displayName, currentUser.email);
        } catch (error) {
          console.error("유저 초기화 실패:", error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 유저 잔고를 실시간으로 구독 (매매하면 자동으로 화면에 반영됨)
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setBalance(snap.data().balance);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 포지션을 실시간으로 구독
  useEffect(() => {
    if (!user) return;
    const positionRef = doc(db, "positions", user.uid);
    const unsubscribe = onSnapshot(positionRef, (snap) => {
      if (snap.exists()) {
        setPosition(snap.data());
      } else {
        setPosition(null);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 최초 한 번 과거 캔들 데이터 불러오기
  useEffect(() => {
    fetchKlines().then(setCandles);
  }, []);

  // 2초마다 가격 갱신 + 새 분봉 감지/생성 로직
  useEffect(() => {
    const updatePrice = async () => {
      // 청산 체크는 별도로 "동시에" 실행 (가격 갱신을 기다리게 하지 않음)
      if (user && position && !isCheckingLiquidation.current) {
        isCheckingLiquidation.current = true;
        checkLiquidationRequest(user.uid)
          .then((liqResult) => {
            if (liqResult.liquidated) {
              showToast(
                `포지션이 강제 청산되었습니다. 청산가: $${liqResult.price.toFixed(2)}`,
                "error"
              );
            }
          })
          .catch((error) => {
            console.error("청산 체크 실패:", error);
          })
          .finally(() => {
            isCheckingLiquidation.current = false;
          });
      }

      // 가격 갱신은 청산 체크를 기다리지 않고 바로 진행
      const result = await fetchBtcPrice();
      if (!result) return;

      setBtcPrice(result.price);

      setCandles((prevCandles) => {
        if (prevCandles.length === 0) return prevCandles;

        const newPrice = result.price;
        const now = Math.floor(result.timestamp / 1000);
        const currentMinuteStart = Math.floor(now / 60) * 60;

        const lastCandle = prevCandles[prevCandles.length - 1];

        if (lastCandle.time === currentMinuteStart) {
          const updatedCandle = {
            ...lastCandle,
            high: Math.max(lastCandle.high, newPrice),
            low: Math.min(lastCandle.low, newPrice),
            close: newPrice,
          };
          return [...prevCandles.slice(0, -1), updatedCandle];
        } else if (currentMinuteStart > lastCandle.time) {
          const newCandle = {
            time: currentMinuteStart,
            open: newPrice,
            high: newPrice,
            low: newPrice,
            close: newPrice,
          };
          return [...prevCandles, newCandle];
        }

        return prevCandles;
      });
    };

    updatePrice();
    const interval = setInterval(updatePrice, 2000);

    return () => clearInterval(interval);
  }, [user, position]);

  useEffect(() => {
    if (!user) return;
    getUserSettings(user.uid).then(setSettings);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const positionRef = doc(db, "positions", user.uid);
    const unsubscribe = onSnapshot(positionRef, (snap) => {
      if (snap.exists()) {
        setPosition(snap.data());
      } else {
        setPosition(null);
      }
    });

    // 접속 시점에 즉시 한 번 청산 체크 (그동안 놓친 청산이 있는지 확인)
    checkLiquidationRequest(user.uid);

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("로그인 에러:", error);
      alert("로그인 실패: " + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setBalance(null);
  };

  const handleToggleSetting = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    if (user) {
      await saveUserSettings(user.uid, newSettings);
    }
  };

  return (
    <div style={{ backgroundColor: "#0b0e11", minHeight: "100vh", color: "#eaecef" }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #1e2329",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px" }}>BTC 모의 거래 시뮬레이션</h1>

        {!user ? (
          <button onClick={handleLogin} style={{ padding: "8px 16px", fontSize: "14px" }}>
            Google로 로그인
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "14px" }}>{user.displayName}</span>
            <span style={{ fontSize: "14px", color: "#0ecb81" }}>
              ${balance !== null ? balance.toLocaleString() : "..."}
            </span>
            <button onClick={handleLogout} style={{ padding: "6px 12px", fontSize: "13px" }}>
              로그아웃
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", padding: "16px", gap: "16px" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "20px", margin: "0 0 8px 0" }}>
            BTC/USDT: {btcPrice ? `$${btcPrice.toLocaleString()}` : "불러오는 중..."}
          </p>
          <PriceChart
            candles={candles}
            setCandles={setCandles}
            latestPrice={btcPrice}
            position={position}
            settings={settings}
          />
        </div>

        <div>
          <TradePanel
            uid={user ? user.uid : null}
            balance={balance}
            currentPrice={btcPrice}
            position={position}
            showToast={showToast}
          />

          <div
            style={{
              backgroundColor: "#161a1e",
              borderRadius: "8px",
              marginTop: "16px",
              width: "300px",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            {/* 탭 버튼 */}
            <div style={{ display: "flex", borderBottom: "1px solid #1e2329" }}>
              <button
                onClick={() => setActiveTab("position")}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: activeTab === "position" ? "#1e2329" : "transparent",
                  color: activeTab === "position" ? "#f0b90b" : "#848e9c",
                  border: "none",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                내 포지션
              </button>
              <button
                onClick={() => setActiveTab("history")}
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: activeTab === "history" ? "#1e2329" : "transparent",
                  color: activeTab === "history" ? "#f0b90b" : "#848e9c",
                  border: "none",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                체결 기록
              </button>
            </div>

            {/* 탭 내용 */}
            {activeTab === "position" ? (
              <PositionInfo
                position={position}
                currentPrice={btcPrice}
                uid={user ? user.uid : null}
                showToast={showToast}
              />
            ) : (
              <TradeHistory uid={user ? user.uid : null} />
            )}
          </div>

          <SettingsPanel settings={settings} onToggle={handleToggleSetting} />
        </div>
      </div>
    </div>
  );
}

export default App;