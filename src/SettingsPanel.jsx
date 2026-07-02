function SettingsPanel({ settings, onToggle }) {
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
      <h3 style={{ marginTop: 0 }}>설정</h3>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "13px" }}>청산가 라인 표시</span>
        <input
          type="checkbox"
          checked={settings.showLiquidationLine}
          onChange={(e) => onToggle("showLiquidationLine", e.target.checked)}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "13px" }}>평단가 라인 표시</span>
        <input
          type="checkbox"
          checked={settings.showAvgPriceLine}
          onChange={(e) => onToggle("showAvgPriceLine", e.target.checked)}
        />
      </div>
    </div>
  );
}

export default SettingsPanel;