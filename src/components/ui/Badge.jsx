import React from 'react';

const variantClasses = {
  default: 'bg-gray-100 text-gray-800',
  primary: 'bg-primary-100 text-primary-800',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger: 'bg-danger-100 text-danger-700',
};

export function Badge({ children, variant = 'default', className = '', ...props }) {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  const colorClasses = variantClasses[variant] || variantClasses.default;
  
  return (
    <span 
      className={`${baseClasses} ${colorClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
