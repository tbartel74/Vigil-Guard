import React from "react";
import Footer from "./Footer";

export default function Layout({ header, sidebar, children }:{ header:React.ReactNode; sidebar:React.ReactNode; children:React.ReactNode; }) {
  return (
    <div className="min-h-screen grid grid-rows-[56px_1fr_48px]">
      <header>{header}</header>
      <div className="grid grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-800 bg-[#0C1117]">{sidebar}</aside>
        <main className="bg-[#0F1419]">{children}</main>
      </div>
      <Footer />
    </div>
  );
}