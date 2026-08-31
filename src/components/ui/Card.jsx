import React from 'react';

export function Card({ children, className = '', ...props }) {
  return (
    <div 
      className={`bg-white rounded-xl shadow-card border border-gray-100 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={`p-6 pb-4 border-b border-gray-50 flex items-center justify-between ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '', ...props }) {
  return (
    <div className={`p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}
