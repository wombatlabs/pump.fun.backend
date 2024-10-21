const randomIntFromInterval = (min: number, max: number) => { // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export const generateNonce = () => {
  return randomIntFromInterval(1, 1_000_000_000)
}
