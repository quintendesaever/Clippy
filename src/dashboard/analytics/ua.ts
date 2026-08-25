export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export type ParsedUserAgent = {
  deviceType: DeviceType;
  browserFamily: string | null;
};

export function parseUserAgent(ua: string | undefined | null): ParsedUserAgent {
  if (!ua?.trim()) {
    return { deviceType: "unknown", browserFamily: null };
  }
  const value = ua.trim();
  const lower = value.toLowerCase();

  let deviceType: DeviceType = "desktop";
  if (/ipad|tablet|playbook|silk/i.test(value) || (lower.includes("android") && !lower.includes("mobile"))) {
    deviceType = "tablet";
  } else if (/mobi|iphone|ipod|android|blackberry|opera mini|opera mobi|iemobile|windows phone/i.test(value)) {
    deviceType = "mobile";
  }

  let browserFamily: string | null = null;
  if (/edg\//i.test(value)) browserFamily = "Edge";
  else if (/opr\/|opera/i.test(value)) browserFamily = "Opera";
  else if (/samsungbrowser/i.test(value)) browserFamily = "Samsung Internet";
  else if (/firefox|fxios/i.test(value)) browserFamily = "Firefox";
  else if (/edg?a\//i.test(value)) browserFamily = "Edge";
  else if (/chrome|crios/i.test(value) && !/edg/i.test(value)) browserFamily = "Chrome";
  else if (/safari/i.test(value) && !/chrome|crios|android/i.test(value)) browserFamily = "Safari";
  else if (/msie|trident/i.test(value)) browserFamily = "IE";

  return { deviceType, browserFamily };
}
