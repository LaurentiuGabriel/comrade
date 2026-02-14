import React from 'react';
import './Input.css';

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'password' | 'email';
}

export function Input({
  value,
  onChange,
  placeholder,
  disabled = false,
  type = 'text',
}: InputProps) {
  return (
    <input
      type={type}
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
