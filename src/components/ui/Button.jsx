import React from 'react';

const variantClasses = {
  primary: 'bg-primary-500 text-white hover:bg-primary-600 focus-visible:ring-primary-500 border border-transparent',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus-visible:ring-gray-500 border border-transparent',
  outline: 'bg-transparent text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-500 border border-gray-300',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 focus-visible:ring-danger-500 border border-transparent',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-500 border border-transparent',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
  icon: 'p-2',
};

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  type = 'button',
  disabled = false,
  ...props 
}) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  return (
    <button 
      type={type}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
