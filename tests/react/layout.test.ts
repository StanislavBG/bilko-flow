import { computeLayout, NODE_W, NODE_H, COL_GAP, ROW_GAP, PADDING } from '../../src/react/layout';
import type { FlowStep } from '../../src/react/types';

function makeStep(id: string, dependsOn: string[] = []): FlowStep {
  return {
    id,
    name: `Step ${id}`,
    type: 'llm',
    description: `Test step ${id}`,
    dependsOn,
  };
}

describe('computeLayout', () => {
  it('returns empty layout for no steps', () => {
    const layout = computeLayout([]);
    expect(layout.nodes.size).toBe(0);
    expect(layout.edges.length).toBe(0);
    expect(layout.width).toBe(0);
    expect(layout.height).toBe(0);
    expect(layout.columns).toBe(0);
    expect(layout.maxLaneCount).toBe(0);
  });

  it('places a single step at column 0', () => {
    const layout = computeLayout([makeStep('a')]);
    expect(layout.nodes.size).toBe(1);
    expect(layout.columns).toBe(1);

    const node = layout.nodes.get('a')!;
    expect(node.column).toBe(0);
    expect(node.row).toBe(0);
    expect(node.x).toBe(PADDING);
    expect(node.y).toBe(PADDING);
    expect(node.width).toBe(NODE_W);
    expect(node.height).toBe(NODE_H);
  });

  it('places sequential steps in consecutive columns', () => {
    const steps = [
      makeStep('a'),
      makeStep('b', ['a']),
      makeStep('c', ['b']),
    ];
    const layout = computeLayout(steps);

    expect(layout.columns).toBe(3);
    expect(layout.nodes.get('a')!.column).toBe(0);
    expect(layout.nodes.get('b')!.column).toBe(1);
    expect(layout.nodes.get('c')!.column).toBe(2);
  });

  it('places parallel steps in the same column', () => {
    const steps = [
      makeStep('a'),
      makeStep('b1', ['a']),
      makeStep('b2', ['a']),
    ];
    const layout = computeLayout(steps);

    expect(layout.columns).toBe(2);
    expect(layout.nodes.get('b1')!.column).toBe(1);
    expect(layout.nodes.get('b2')!.column).toBe(1);
    expect(layout.maxLaneCount).toBe(2);
  });

  it('generates edges for dependencies', () => {
    const steps = [
      makeStep('a'),
      makeStep('b', ['a']),
    ];
    const layout = computeLayout(steps);

    expect(layout.edges.length).toBe(1);
    expect(layout.edges[0].fromId).toBe('a');
    expect(layout.edges[0].toId).toBe('b');
  });

  it('computes correct dimensions', () => {
    const steps = [
      makeStep('a'),
      makeStep('b', ['a']),
    ];
    const layout = computeLayout(steps);

    const expectedWidth = PADDING * 2 + 2 * NODE_W + 1 * COL_GAP;
    const expectedHeight = PADDING * 2 + 1 * NODE_H;
    expect(layout.width).toBe(expectedWidth);
    expect(layout.height).toBe(expectedHeight);
  });

  it('handles diamond dependency pattern', () => {
    const steps = [
      makeStep('a'),
      makeStep('b', ['a']),
      makeStep('c', ['a']),
      makeStep('d', ['b', 'c']),
    ];
    const layout = computeLayout(steps);

    expect(layout.nodes.get('a')!.column).toBe(0);
    expect(layout.nodes.get('b')!.column).toBe(1);
    expect(layout.nodes.get('c')!.column).toBe(1);
    expect(layout.nodes.get('d')!.column).toBe(2);
    expect(layout.edges.length).toBe(4);
  });

  it('handles disconnected nodes', () => {
    const steps = [
      makeStep('a'),
      makeStep('b'),
    ];
    const layout = computeLayout(steps);

    expect(layout.nodes.get('a')!.column).toBe(0);
    expect(layout.nodes.get('b')!.column).toBe(0);
    expect(layout.maxLaneCount).toBe(2);
  });

  it('edge coordinates connect right side of source to left side of target', () => {
    const steps = [
      makeStep('a'),
      makeStep('b', ['a']),
    ];
    const layout = computeLayout(steps);
    const edge = layout.edges[0];
    const fromNode = layout.nodes.get('a')!;
    const toNode = layout.nodes.get('b')!;

    expect(edge.fromX).toBe(fromNode.x + fromNode.width);
    expect(edge.fromY).toBe(fromNode.y + fromNode.height / 2);
    expect(edge.toX).toBe(toNode.x);
    expect(edge.toY).toBe(toNode.y + toNode.height / 2);
  });

  it('centers children vertically around their parent', () => {
    // Fan-out: one parent with two children
    const steps = [
      makeStep('a'),
      makeStep('b1', ['a']),
      makeStep('b2', ['a']),
    ];
    const layout = computeLayout(steps);

    const parent = layout.nodes.get('a')!;
    const child1 = layout.nodes.get('b1')!;
    const child2 = layout.nodes.get('b2')!;

    // Children's vertical midpoint should equal the parent's vertical center
    const parentCenterY = parent.y + parent.height / 2;
    const childrenMidY = (child1.y + child1.height / 2 + child2.y + child2.height / 2) / 2;
    expect(childrenMidY).toBe(parentCenterY);
  });

  it('centers diamond join node between its parents', () => {
    // Diamond: a → b, c; b, c → d
    const steps = [
      makeStep('a'),
      makeStep('b', ['a']),
      makeStep('c', ['a']),
      makeStep('d', ['b', 'c']),
    ];
    const layout = computeLayout(steps);

    const b = layout.nodes.get('b')!;
    const c = layout.nodes.get('c')!;
    const d = layout.nodes.get('d')!;

    // d should be centered between b and c
    const parentsMidY = (b.y + b.height / 2 + c.y + c.height / 2) / 2;
    const dCenterY = d.y + d.height / 2;
    expect(dCenterY).toBe(parentsMidY);
  });
});
