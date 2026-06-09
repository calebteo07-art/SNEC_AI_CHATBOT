import { ReactNode, useState, useEffect } from 'react';

interface TransitionProps {
  in?: boolean;
  timeout?: number;
  children: (state: { visible: boolean; status: string }) => ReactNode;
}

export function Transition({ in: inProp = true, timeout = 500, children }: TransitionProps) {
  const [status, setStatus] = useState<'entering' | 'entered' | 'exiting' | 'exited'>(
    inProp ? 'entering' : 'exited'
  );

  useEffect(() => {
    if (inProp) {
      setStatus('entering');
      const timer = setTimeout(() => setStatus('entered'), 50);
      return () => clearTimeout(timer);
    } else {
      setStatus('exiting');
      const timer = setTimeout(() => setStatus('exited'), timeout);
      return () => clearTimeout(timer);
    }
  }, [inProp, timeout]);

  return <>{children({ visible: status === 'entered', status })}</>;
}
