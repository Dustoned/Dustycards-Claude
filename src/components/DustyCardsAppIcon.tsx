export default function DustyCardsAppIcon({ canvasSize }: { canvasSize: number }) {
  const scale = canvasSize / 512;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#07080B",
        color: "#FFFFFF",
      }}
    >
      <div
        style={{
          width: "76%",
          height: "76%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          border: `${Math.max(1, 2 * scale)}px solid #353C50`,
          borderRadius: "28%",
          background: "linear-gradient(145deg, #171A22 0%, #101218 62%, #0B0C11 100%)",
          boxShadow: `0 ${28 * scale}px ${80 * scale}px rgba(0,0,0,0.55)`,
        }}
      >
        <div
          style={{
            width: "62%",
            height: "76%",
            position: "absolute",
            border: `${10 * scale}px solid rgba(179,155,255,0.82)`,
            borderRadius: "13%",
            background: "linear-gradient(150deg, #6E4DFF 0%, #5D8BFF 54%, #38BDF8 100%)",
            transform: "rotate(-7deg)",
            boxShadow: `0 ${20 * scale}px ${56 * scale}px rgba(110,77,255,0.35)`,
          }}
        />
        <div
          style={{
            width: "46%",
            height: "58%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "absolute",
            border: `${5 * scale}px solid rgba(255,255,255,0.7)`,
            borderRadius: "12%",
            background: "rgba(7,8,11,0.5)",
            transform: "rotate(-7deg)",
          }}
        >
          <span
            style={{
              display: "flex",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 92 * scale,
              fontWeight: 900,
              letterSpacing: "-0.09em",
              transform: "translateX(-4%)",
            }}
          >
            DC
          </span>
        </div>
      </div>
    </div>
  );
}
