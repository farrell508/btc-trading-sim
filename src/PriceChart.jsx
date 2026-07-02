import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts";
import { fetchOlderKlines } from "./bybit";

function PriceChart({ candles, setCandles, latestPrice, position, settings }) {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const isLoadingMore = useRef(false);
  const candlesRef = useRef(candles);

  const liqLineRef = useRef(null); // 청산가 라인 참조
  const avgLineRef = useRef(null); // 평단가 라인 참조

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e11" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#1e2329" },
        horzLines: { color: "#1e2329" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const date = new Date(time * 1000);
          const hours = (date.getUTCHours() + 9) % 24;
          const minutes = date.getUTCMinutes();
          return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        },
      },
      localization: {
        timeFormatter: (time) => {
          const date = new Date(time * 1000);
          const hours = (date.getUTCHours() + 9) % 24;
          const minutes = date.getUTCMinutes();
          return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#0ecb81",
      downColor: "#f6465d",
      borderVisible: false,
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d",
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    chart.timeScale().subscribeVisibleLogicalRangeChange(async (range) => {
      if (!range || isLoadingMore.current) return;
      if (range.from < 10) {
        const currentCandles = candlesRef.current;
        if (!currentCandles || currentCandles.length === 0) return;

        isLoadingMore.current = true;
        const oldestTime = currentCandles[0].time;
        const olderCandles = await fetchOlderKlines(oldestTime * 1000);

        if (olderCandles.length > 0) {
          setCandles((prev) => {
            const existingTimes = new Set(prev.map((c) => c.time));
            const newOnes = olderCandles.filter((c) => !existingTimes.has(c.time));
            if (newOnes.length === 0) return prev;
            return [...newOnes, ...prev];
          });
        }
        isLoadingMore.current = false;
      }
    });

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && candles && candles.length > 0) {
      seriesRef.current.setData(candles);
    }
  }, [candles]);

  // 평단가 / 청산가 라인 그리기 (포지션이나 설정이 바뀔 때마다 다시 그림)
  useEffect(() => {
    if (!seriesRef.current) return;

    // 기존 라인 제거
    if (liqLineRef.current) {
      seriesRef.current.removePriceLine(liqLineRef.current);
      liqLineRef.current = null;
    }
    if (avgLineRef.current) {
      seriesRef.current.removePriceLine(avgLineRef.current);
      avgLineRef.current = null;
    }

    if (!position) return;

    // 평단가 라인
    if (settings.showAvgPriceLine) {
      avgLineRef.current = seriesRef.current.createPriceLine({
        price: position.entryPrice,
        color: "#f0b90b",
        lineWidth: 1,
        lineStyle: 2, // 점선
        axisLabelVisible: true,
        title: "평단가",
      });
    }

    // 청산가 라인
    if (settings.showLiquidationLine && position.leverage > 1) {
      liqLineRef.current = seriesRef.current.createPriceLine({
        price: position.liquidationPrice,
        color: "#f6465d",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "청산가",
      });
    }
  }, [position, settings]);

  return <div ref={chartContainerRef} />;
}

export default PriceChart;