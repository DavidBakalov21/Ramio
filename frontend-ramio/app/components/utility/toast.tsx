"use client";
import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
  } from "react";
  import { motion, AnimatePresence } from "framer-motion";
  import { 
    CheckCircle, 
    XCircle, 
    AlertTriangle, 
    Info, 
    MessageCircle,
    X 
  } from "lucide-react";
  
  type ToastVariant = "success" | "error" | "warning" | "info" | "message";
  
  interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
    title?: string;
    persistent?: boolean;
  }
  
  const ToastContext = createContext<{
    showToast: (
      message: string,
      variant?: ToastVariant,
      duration?: number,
      title?: string,
      persistent?: boolean
    ) => void;
  } | null>(null);
  
  const toastConfig: Record<ToastVariant, {
    icon: React.ComponentType<{ className?: string }>;
    bgColor: string;
    borderColor: string;
    textColor: string;
    iconColor: string;
    title: string;
  }> = {
    success: {
      icon: CheckCircle,
      bgColor: "bg-white dark:bg-gray-900",
      borderColor: "border-green-200 dark:border-green-800",
      textColor: "text-gray-900 dark:text-gray-100",
      iconColor: "text-green-600 dark:text-green-400",
      title: "Success"
    },
    error: {
      icon: XCircle,
      bgColor: "bg-white dark:bg-gray-900",
      borderColor: "border-red-200 dark:border-red-800",
      textColor: "text-gray-900 dark:text-gray-100",
      iconColor: "text-red-600 dark:text-red-400",
      title: "Error"
    },
    warning: {
      icon: AlertTriangle,
      bgColor: "bg-white dark:bg-gray-900",
      borderColor: "border-orange-200 dark:border-orange-800",
      textColor: "text-gray-900 dark:text-gray-100",
      iconColor: "text-orange-600 dark:text-orange-400",
      title: "Warning"
    },
    info: {
      icon: Info,
      bgColor: "bg-white dark:bg-gray-900",
      borderColor: "border-blue-200 dark:border-blue-800",
      textColor: "text-gray-900 dark:text-gray-100",
      iconColor: "text-blue-600 dark:text-blue-400",
      title: "Info"
    },
    message: {
      icon: MessageCircle,
      bgColor: "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20",
      borderColor: "border-blue-300 dark:border-blue-700",
      textColor: "text-gray-900 dark:text-gray-100",
      iconColor: "text-blue-600 dark:text-blue-400",
      title: "New Message"
    }
  };
  
  const ToastItem: React.FC<{
    toast: Toast;
    onRemove: (id: number) => void;
  }> = ({ toast, onRemove }) => {
    const config = toastConfig[toast.variant];
    const Icon = config.icon;
  
    return (
      <motion.div
        initial={{ opacity: 0, x: 400, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 400, scale: 0.95 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
          duration: 0.4
        }}
        className={`
          relative max-w-sm w-full
          ${config.bgColor}
          border border-solid ${config.borderColor}
          ${toast.variant === 'message' ? 'rounded-3xl' : 'rounded-2xl'}
          shadow-2xl
          backdrop-blur-sm
          overflow-hidden
          group
          transition-all duration-300 ease-out
          hover:scale-[1.02]
          ${toast.variant === 'message' ? 'ring-2 ring-blue-200/50 dark:ring-blue-800/50' : ''}
        `}
        style={{
          boxShadow: `
            0 35px 60px -12px rgba(0, 0, 0, 0.4),
            0 20px 25px -5px rgba(0, 0, 0, 0.15),
            0 10px 10px -5px rgba(0, 0, 0, 0.1),
            0 0 0 1px rgba(0, 0, 0, 0.08),
            0 4px 6px -1px rgba(0, 0, 0, 0.1)
          `
        }}
        whileHover={{
          boxShadow: `
            0 45px 80px -12px rgba(0, 0, 0, 0.5),
            0 25px 35px -5px rgba(0, 0, 0, 0.2),
            0 15px 15px -5px rgba(0, 0, 0, 0.15),
            0 0 0 1px rgba(0, 0, 0, 0.12),
            0 6px 8px -1px rgba(0, 0, 0, 0.15)
          `
        }}
        role="alert"
        aria-live="polite"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="relative p-4 flex items-start gap-3">
          <div className={`
            flex-shrink-0 ${toast.variant === 'message' ? 'w-8 h-8' : 'w-6 h-6'} rounded-full
            ${toast.variant === 'message' ? 'bg-blue-100 dark:bg-blue-900/30' : ''}
            ${config.iconColor}
            flex items-center justify-center
            transition-transform duration-200
            group-hover:scale-110
          `}>
            <Icon className={`${toast.variant === 'message' ? 'w-6 h-6' : 'w-5 h-5'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`
              ${toast.variant === 'message' ? 'text-base font-bold' : 'text-sm font-semibold'} leading-5
              ${config.textColor}
              mb-1
            `}>
              {toast.title || config.title}
            </div>
            <div className={`
              text-sm leading-5
              ${config.textColor}
              opacity-90
            `}>
              {toast.message}
            </div>
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className={`
              flex-shrink-0 w-6 h-6 rounded-full
              flex items-center justify-center
              ${config.textColor}
              opacity-40 hover:opacity-70
              transition-all duration-200
              hover:bg-gray-100 dark:hover:bg-gray-800
              focus:outline-none focus:ring-2 focus:ring-offset-2
              focus:ring-gray-300 dark:focus:ring-gray-600
            `}
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {!toast.persistent && (
          <motion.div
            className={`
              absolute bottom-0 left-0 h-1
              ${config.iconColor.replace('text-', 'bg-')}
              opacity-60
            `}
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 3, ease: "linear" }}
          />
        )}
      </motion.div>
    );
  };
  
  export const ToastProvider: React.FC<{ children: ReactNode }> = ({
    children,
  }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
  
    const showToast = useCallback(
      (
        message: string, 
        variant: ToastVariant = "info", 
        duration = 3000,
        title?: string,
        persistent = false
      ) => {
        const id = Date.now();
        const newToast: Toast = { id, message, variant, title, persistent };
  
        setToasts((prev) => [...prev, newToast]);
        if (!persistent) {
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
          }, duration);
        }
      },
      []
    );
  
    const removeToast = useCallback((id: number) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
  
    return (
      <ToastContext.Provider value={{ showToast }}>
        {children}
        <div className="fixed top-4 right-4 z-[10000] space-y-3 pointer-events-none">
          <AnimatePresence mode="popLayout">
            {toasts.map((toast) => (
              <div key={toast.id} className="pointer-events-auto">
                <ToastItem toast={toast} onRemove={removeToast} />
              </div>
            ))}
          </AnimatePresence>
        </div>
      </ToastContext.Provider>
    );
  };
  
  export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within a ToastProvider");
    return ctx;
  };
  