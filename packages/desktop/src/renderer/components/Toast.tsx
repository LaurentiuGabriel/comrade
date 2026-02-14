/**
 * Toast component
 */

import React, { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks.js';
import { hideToast } from '../slices/uiSlice.js';

export function Toast() {
  const dispatch = useAppDispatch();
  const { toast } = useAppSelector((state) => state.ui);

  useEffect(() => {
    if (toast?.visible) {
      const timer = setTimeout(() => {
        dispatch(hideToast());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, dispatch]);

  if (!toast?.visible) return null;

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
  };

  const Icon = icons[toast.type];

  return (
    <div className={`toast toast-${toast.type}`}>
      <Icon size={20} />
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={() => dispatch(hideToast())}>
        <X size={16} />
      </button>
    </div>
  );
}
