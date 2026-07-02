import Toast from "./Toast";

function ToastContainer({ toasts, removeToast }) {
  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: 9999,
      }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

export default ToastContainer;