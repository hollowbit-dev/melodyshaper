// Draws Melodyshaper's app icon (1024x1024 PNG): a pink-violet tile with a sound wave rising into a note.
import AppKit
let size: CGFloat = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext
let inset: CGFloat = 100
let rect = CGRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let tile = CGPath(roundedRect: rect, cornerWidth: 190, cornerHeight: 190, transform: nil)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 40, color: NSColor(white: 0, alpha: 0.35).cgColor)
ctx.addPath(tile); ctx.setFillColor(NSColor.black.cgColor); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addPath(tile); ctx.clip()
let colors = [NSColor(red: 1, green: 0.56, blue: 0.76, alpha: 1).cgColor, NSColor(red: 0.84, green: 0.48, blue: 0.9, alpha: 1).cgColor, NSColor(red: 0.47, green: 0.38, blue: 0.95, alpha: 1).cgColor] as CFArray
let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.5, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: inset, y: size - inset), end: CGPoint(x: size - inset, y: inset), options: [])
ctx.restoreGState()
let ink = NSColor(red: 0.11, green: 0.06, blue: 0.14, alpha: 1).cgColor
ctx.setFillColor(ink)
let bars: [(CGFloat, CGFloat)] = [(262, 90), (344, 170), (426, 110)]
for (x, h) in bars {
  ctx.addPath(CGPath(roundedRect: CGRect(x: x - 26, y: 450 - h / 2, width: 52, height: h), cornerWidth: 26, cornerHeight: 26, transform: nil))
}
ctx.fillPath()
ctx.fillEllipse(in: CGRect(x: 510, y: 280, width: 190, height: 150))
ctx.fill(CGRect(x: 650, y: 350, width: 50, height: 390))
let flag = CGMutablePath()
flag.move(to: CGPoint(x: 650, y: 740))
flag.addCurve(to: CGPoint(x: 800, y: 560), control1: CGPoint(x: 700, y: 670), control2: CGPoint(x: 815, y: 650))
flag.addCurve(to: CGPoint(x: 700, y: 625), control1: CGPoint(x: 780, y: 610), control2: CGPoint(x: 740, y: 625))
flag.addLine(to: CGPoint(x: 650, y: 625))
flag.closeSubpath()
ctx.addPath(flag); ctx.fillPath()
NSGraphicsContext.current = nil
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
