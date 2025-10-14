import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface MobileContextType {
  isMobile: boolean;
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const MobileContext = createContext<MobileContextType | undefined>(undefined);

export function MobileProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Auto-close sidebar when switching to desktop
      if (!mobile) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);

  return (
    <MobileContext.Provider value={{ isMobile, isSidebarOpen, setSidebarOpen: setIsSidebarOpen, toggleSidebar }}>
      {children}
    </MobileContext.Provider>
  );
}

export function useMobile() {
  const context = useContext(MobileContext);
  if (!context) {
    throw new Error('useMobile must be used within MobileProvider');
  }
  return context;
}
