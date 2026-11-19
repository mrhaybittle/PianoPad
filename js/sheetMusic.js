export function drawSheetMusicStaff(ctx, width) {
    const STAFF_HEIGHT = 75;
    const line1_y = 56;
    const lineSpacing = 8;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, STAFF_HEIGHT);

    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, STAFF_HEIGHT);
    ctx.lineTo(width, STAFF_HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const ly = line1_y - i * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(width, ly);
        ctx.stroke();
    }

    ctx.fillStyle = '#000000';
    ctx.font = '68px "Segoe UI Symbol", "Apple Symbols", "Noto Music", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('𝄞', 35, 48);

    ctx.restore();
}

export function drawStemlessNote(ctx, x, y, isSharp, color = '#000000') {
    ctx.save();
    ctx.fillStyle = color;

    if (isSharp) {
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('♯', x - 7, y);
    }

    ctx.beginPath();
    ctx.ellipse(x, y, 5.5, 4.0, -0.25, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
}

export function drawLedgerLines(ctx, x, step, line1_y, halfStep, color = '#000000') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;

    if (step <= -2) {
        const ly = line1_y + 2 * halfStep;
        ctx.beginPath();
        ctx.moveTo(x - 9, ly);
        ctx.lineTo(x + 9, ly);
        ctx.stroke();
    }

    if (step >= 10) {
        const ly1 = line1_y - 10 * halfStep;
        ctx.beginPath();
        ctx.moveTo(x - 9, ly1);
        ctx.lineTo(x + 9, ly1);
        ctx.stroke();
    }

    if (step >= 12) {
        const ly2 = line1_y - 12 * halfStep;
        ctx.beginPath();
        ctx.moveTo(x - 9, ly2);
        ctx.lineTo(x + 9, ly2);
        ctx.stroke();
    }

    ctx.restore();
}
