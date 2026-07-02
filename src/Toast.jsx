import { useEffect, useRef } from "react";

function Toast({ message, type = "info", onClose }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // 항상 최신 onClose를 참조하도록 갱신

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, 3000);
    return () => clearTimeout(timer);
  }, []); // 빈 배열 -> 컴포넌트가 처음 생성될 때 딱 한 번만 실행

  const colors = {
    success: "#0ecb81",
    error: "#f6465d",
    info: "#f0b90b",
  };

  return (
    <div
      style={{
        backgroundColor: "#1e2329",
        borderLeft: `4px solid ${colors[type]}`,
        color: "#eaecef",
        padding: "12px 16px",
        borderRadius: "4px",
        marginBottom: "8px",
        minWidth: "260px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        fontSize: "14px",
        fontFamily: "sans-serif",
      }}
    >
      {message}
    </div>
  );
}

export default Toast;