// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ParkingChip } from './ui.tsx'

afterEach(cleanup)

describe('ParkingChip', () => {
  it('shows nothing when the guest did not ask for parking', () => {
    const { container } = render(<ParkingChip parking="none" />)
    expect(container.textContent).toBe('')
  })
  it('names the vehicle, the same way on every screen', () => {
    const { rerender } = render(<ParkingChip parking="two_wheeler" />)
    expect(screen.getByText('2-wheeler parking')).toBeTruthy()
    rerender(<ParkingChip parking="four_wheeler" />)
    expect(screen.getByText('4-wheeler parking')).toBeTruthy()
  })
})
