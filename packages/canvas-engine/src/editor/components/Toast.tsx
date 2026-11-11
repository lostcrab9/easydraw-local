import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { ToastTone } from "../types";
import { CloseIcon } from "./icons";
import "./Toast.scss";

// Matches the host notice timing.
const DEFAULT_TOAST_TIMEOUT = 3200;

export const Toast = ({
  message,
  onClose,
  closable = false,
  // To prevent autoclose, pass duration as Infinity
  duration = DEFAULT_TOAST_TIMEOUT,
  style,
  tone = "info",
}: {
  tone?: ToastTone;
  message: string;
  onClose: () => void;
  closable?: boolean;
  duration?: number;
  style?: CSSProperties;
}) => {
  const timerRef = useRef<number>(0);
  const shouldAutoClose = duration !== Infinity;
  const scheduleTimeout = useCallback(() => {
    if (!shouldAutoClose) {
      return;
    }
    timerRef.current = window.setTimeout(() => onClose(), duration);
  }, [onClose, duration, shouldAutoClose]);

  useEffect(() => {
    if (!shouldAutoClose) {
      return;
    }
    scheduleTimeout();
    return () => clearTimeout(timerRef.current);
  }, [scheduleTimeout, message, duration, shouldAutoClose]);

  const onMouseEnter = shouldAutoClose
    ? () => clearTimeout(timerRef?.current)
    : undefined;
  const onMouseLeave = shouldAutoClose ? scheduleTimeout : undefined;
  return (
    <div
      className={`Toast Toast--${tone}`}
      role="status"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
    >
      <span className="Toast__icon" aria-hidden="true">
        {tone === "success" ? "✓" : tone === "danger" ? "!" : "i"}
      </span>
      <p className="Toast__message">{message}</p>
      {closable && (
        <button
          type="button"
          className="Toast__close"
          aria-label="close"
          onClick={onClose}
        >
          {CloseIcon}
        </button>
      )}
    </div>
  );
};
