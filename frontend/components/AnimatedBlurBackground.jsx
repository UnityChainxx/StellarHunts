"use client";

import React from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const AnimatedBlurBackground = () => {
  const prefersReducedMotion = useReducedMotion();
  const pulseClass = prefersReducedMotion ? "" : "animate-pulse";

  return (
    <div className="absolute inset-0">
      <div className={`absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-50 ${pulseClass}`} />
      <div className={`absolute top-1/2 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-50 ${pulseClass} delay-700`} />
      <div className={`absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-50 ${pulseClass} delay-1000`} />
    </div>
  );
};

export default AnimatedBlurBackground;
