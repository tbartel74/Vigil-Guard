import React from "react";
import { Outlet } from "react-router-dom";
import ConfigNav from "./ConfigNav";

export default function ConfigLayout() {
  return (
    <div className="grid grid-cols-[280px_1fr] h-[calc(100vh-104px)]">
      <div className="border-r border-slate-800 bg-[#0C1117]">
        <ConfigNav />
      </div>
      <div className="overflow-auto bg-[#0F1419]">
        <Outlet />
      </div>
    </div>
  );
}