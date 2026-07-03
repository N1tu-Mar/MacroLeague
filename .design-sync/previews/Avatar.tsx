import React from 'react';
import { Avatar, Colors, FontFamily, FontSize } from 'macroleague';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: Colors.background,
      padding: 16,
      borderRadius: 12,
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      flexWrap: 'wrap',
      width: 'fit-content',
    }}
  >
    {children}
  </div>
);

const caption: React.CSSProperties = {
  fontFamily: FontFamily.bodySemiBold,
  color: Colors.textSecondary,
  fontSize: FontSize.meta,
  textAlign: 'center' as const,
  marginTop: 6,
};

const Labeled = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    {children}
    <div style={caption}>{label}</div>
  </div>
);

export const Initials = () => (
  <Row>
    <Avatar name="Maya Chen" />
    <Avatar name="Jordan Okafor" />
    <Avatar name="Priya Raman" />
    <Avatar name="Diego Alvarez" />
    <Avatar name="Sam Whitfield" />
  </Row>
);

export const Sizes = () => (
  <Row>
    <Labeled label="24">
      <Avatar name="Maya Chen" size={24} />
    </Labeled>
    <Labeled label="40">
      <Avatar name="Maya Chen" size={40} />
    </Labeled>
    <Labeled label="64">
      <Avatar name="Maya Chen" size={64} />
    </Labeled>
    <Labeled label="96">
      <Avatar name="Maya Chen" size={96} />
    </Labeled>
  </Row>
);

export const Rings = () => (
  <Row>
    <Labeled label="You">
      <Avatar name="Nitu Maramreddy" size={56} ring={Colors.primary} />
    </Labeled>
    <Labeled label="1st place">
      <Avatar name="Maya Chen" size={56} ring={Colors.gold} />
    </Labeled>
    <Labeled label="Rival">
      <Avatar name="Jordan Okafor" size={56} ring={Colors.error} />
    </Labeled>
    <Labeled label="No ring">
      <Avatar name="Priya Raman" size={56} />
    </Labeled>
  </Row>
);

export const UnsafeUrlFallback = () => (
  <Row>
    {/* Non-https avatar_url is rejected by the component — it must fall back to the initial. */}
    <Labeled label="http:// blocked">
      <Avatar name="Diego Alvarez" size={56} url="http://evil.example/pic.png" />
    </Labeled>
    <Labeled label="null url">
      <Avatar name="Sam Whitfield" size={56} url={null} />
    </Labeled>
  </Row>
);
