import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'md' | 'sm';
};

export function Button({ className = '', variant = 'secondary', size = 'md', ...props }: ButtonProps) {
  return <button className={`button button-${variant} button-${size} ${className}`.trim()} {...props} />;
}
