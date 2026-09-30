import { describe, expect, it } from 'vitest'
import { loginEmail } from './auth.ts'

describe('signing in with an email or a name', () => {
  it('turns a plain name into <name in lowercase>@nemeceren.example', () => {
    expect(loginEmail('Anahit')).toBe('anahit@nemeceren.example')
    expect(loginEmail('  ANAHIT ')).toBe('anahit@nemeceren.example')
  })

  it('leaves an email as it is (only the spaces around it go)', () => {
    expect(loginEmail('claude-test@example.com')).toBe('claude-test@example.com')
    expect(loginEmail(' Someone@Example.com ')).toBe('Someone@Example.com')
    expect(loginEmail('anahit@nemeceren.example')).toBe('anahit@nemeceren.example')
  })

  it('refuses an empty field or a name with spaces, with a message for the form', () => {
    expect(() => loginEmail('   ')).toThrow('Type your email or your name.')
    expect(() => loginEmail('Anahit T')).toThrow(/one word, without spaces/)
  })
})
