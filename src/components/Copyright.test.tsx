import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Copyright from './Copyright'

describe('Copyright', () => {
  it('should render copyright text with current year', () => {
    render(<Copyright />)

    const currentYear = new Date().getFullYear()
    const copyrightText = screen.getByText(/Copyright ©/i)

    expect(copyrightText).toBeInTheDocument()
    expect(copyrightText).toHaveTextContent(String(currentYear))
  })

  it('should render link to Kotkoa GitHub', () => {
    render(<Copyright />)

    const link = screen.getByRole('link', { name: /Kotkoa/i })

    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://github.com/Kotkoa')
  })

  it('should have no underline class on link', () => {
    render(<Copyright />)

    const link = screen.getByRole('link', { name: /Kotkoa/i })

    expect(link).toHaveClass('no-underline')
  })
})
