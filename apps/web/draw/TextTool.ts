import { Game } from './Game';
import { Tools } from "../components/Canvas";
import { Payload, Shapes } from './http';

/**
 * Adds text tool functionality to the Game class
 */
export function setupTextTool(game: Game) {
  // Store the original onMouseDown method
  const originalOnMouseDown = game.onMouseDown;

  // Override the onMouseDown method
  game.onMouseDown = function(e: MouseEvent) {
    if (this.selectedTool === Tools.Text) {
      const pos = this.getMousePos(e);
      console.log("Text tool clicked at", pos);
      
      // Prompt user for text input
      const textContent = prompt("Enter text:", "");
      
      if (textContent) {
        // Create text shape
        const textShape: Shapes = {
          type: "text",
          x: pos.x,
          y: pos.y,
          content: textContent,
          fontSize: 16,
          fontFamily: "Arial"
        };
        
        // Create payload and add to shapes
        const id = `${Math.random() * 11}`;
        const payload: Payload = {
          function: "draw",
          shape: textShape,
          id,
          timestamp: Date.now(),
        };
        
        this.addToHistory({
          type: "draw",
          payload,
        });
        
        // Send to server
        this.socket.send(
          JSON.stringify({
            type: "chat",
            roomId: this.roomId,
            message: JSON.stringify(payload),
          })
        );
        
        this.tempShapes.push(payload);
        this.render();
      }
    } else {
      // Call the original method for other tools
      originalOnMouseDown.call(this, e);
    }
  };

  // Store the original render method
  const originalRender = game.render;

  // Override the render method to handle text rendering
  game.render = function() {
    // Call the original render method
    originalRender.call(this);
    
    // Render text shapes
    this.tempShapes.forEach((tempShape) => {
      if (tempShape.function === "draw" && tempShape.shape.type === "text") {
        const textShape = tempShape.shape as any; // Using any because TypeScript might not recognize the text shape
        this.ctx.font = `${textShape.fontSize || 16}px ${textShape.fontFamily || 'Arial'}`;
        this.ctx.fillStyle = tempShape.color || "black";
        this.ctx.fillText(textShape.content, textShape.x, textShape.y);
      }
    });
  };
}