import React, { useEffect, useState } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';

interface CountdownProps {
  /** ISO timestamp to count down to. */
  to: string;
  style?: StyleProp<TextStyle>;
  /** Text shown once the target has passed. */
  endedLabel?: string;
}

function format(msLeft: number, endedLabel: string): string {
  if (msLeft <= 0) return endedLabel;
  const totalMinutes = Math.floor(msLeft / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

/** Live countdown label; re-renders once a minute (cheap, accurate enough). */
export default function Countdown({ to, style, endedLabel = 'Gameweek over' }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const msLeft = new Date(to).getTime() - now;
  return <Text style={style}>{format(msLeft, endedLabel)}</Text>;
}
