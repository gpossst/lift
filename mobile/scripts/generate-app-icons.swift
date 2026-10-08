// Run from mobile/: swift scripts/generate-app-icons.swift
// Render the existing flex vector at its resting frame; no image dependencies.
import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let animation = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("assets/flex.json"))) as! [String: Any]
let layers = animation["layers"] as! [[String: Any]]
let groups = layers[1]["shapes"] as! [[String: Any]]
let items = groups[0]["it"] as! [[String: Any]]
let shapeItems = items[0]["it"] as! [[String: Any]]
let keyframes = (shapeItems[0]["ks"] as! [String: Any])["k"] as! [[String: Any]]
let shape = (keyframes[0]["s"] as! [[String: Any]])[0]
let vertices = shape["v"] as! [[Double]]
let incoming = shape["i"] as! [[Double]]
let outgoing = shape["o"] as! [[Double]]
let vector = CGMutablePath()
vector.move(to: CGPoint(x: vertices[0][0], y: vertices[0][1]))
for index in vertices.indices {
  let next = (index + 1) % vertices.count
  vector.addCurve(to: CGPoint(x: vertices[next][0], y: vertices[next][1]),
    control1: CGPoint(x: vertices[index][0] + outgoing[index][0], y: vertices[index][1] + outgoing[index][1]),
    control2: CGPoint(x: vertices[next][0] + incoming[next][0], y: vertices[next][1] + incoming[next][1]))
}
vector.closeSubpath()
let bounds = vector.boundingBoxOfPath
let scale = 640 / max(bounds.width, bounds.height)
let output = root.appendingPathComponent("assets/app-icons")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let accents = ["yellow": 0xFFCC4A, "red": 0xFF5151, "blue": 0x5194FF]
func color(_ hex: Int) -> CGColor {
  CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [
    CGFloat((hex >> 16) & 255) / 255, CGFloat((hex >> 8) & 255) / 255, CGFloat(hex & 255) / 255, 1,
  ])!
}
for (mode, background) in ["light": 0xF9F9F7, "dark": 0x151612] {
  for (accent, foreground) in accents {
    let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    context.setFillColor(color(background))
    context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
    context.translateBy(x: 512, y: 512)
    context.scaleBy(x: scale, y: -scale)
    context.translateBy(x: -bounds.midX, y: -bounds.midY)
    context.addPath(vector)
    context.setFillColor(color(foreground))
    context.fillPath()
    let image = NSBitmapImageRep(cgImage: context.makeImage()!)
    try image.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent("\(mode)-\(accent).png"))
  }
}
