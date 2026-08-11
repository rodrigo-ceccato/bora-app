/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../../src/pages/HomePage';

afterEach(cleanup);

describe('Home page DOM', () => {
  it('renders its stable shell without axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const results = await axe.run(container, {
      rules: {
        // jsdom has no layout engine, so it cannot calculate color contrast.
        'color-contrast': { enabled: false }
      }
    });
    expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  });
});
