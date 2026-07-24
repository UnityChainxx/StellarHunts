"use client";

/**
 * NftGalleryVirtualized
 * ---------------------
 * Windowed (`react-window`-style) NFT gallery that only renders the rows
 * currently visible in the viewport. This is what fixes #104 on the client
 * side: even when the backend returns thousands of NFTs, the DOM only ever
 * contains a few dozen nodes so scroll stays smooth and `localStorage`
 * never blows its quota.
 *
 * The implementation deliberately avoids any extra third-party windowing
 * dependency. The whole thing is one scroll container with absolute-
 * positioned row groups, each row is a flex container sized to
 * `tilesPerRow`. Multi-row galleries now render correctly.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import NFTCard from "./NftCard";

interface NFTLike {
  id?: string | null;
  name?: string;
  src?: string;
  rarity?: string;
  description?: string;
  locked?: boolean;
  requirements?: string[];
}

export interface NftGalleryVirtualizedProps {
  items: NFTLike[];
  /** Approximate rendered height of each row in pixels. */
  rowHeight?: number;
  /** Number of tiles per row at the current viewport width bucket. */
  tilesPerRow?: number;
  /** Bottom sentinel — fires when the user scrolls within `threshold`px of it. */
  onReachEnd?: () => void;
  /** Extra rows to render above/below the visible area to avoid blank flashes. */
  overscan?: number;
  /** Tailwind/object-friendly className for the scroll container. */
  className?: string;
}

const DEFAULT_ROW_HEIGHT = 360;
const DEFAULT_TILES_PER_ROW = 4;
const DEFAULT_OVERSCAN = 2;
const MIN_TILES_PER_ROW = 1;

const chunkByTilesPerRow = <T,>(items: T[], tilesPerRow: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += tilesPerRow) {
    out.push(items.slice(i, i + tilesPerRow));
  }
  return out;
};

const NftGalleryVirtualized = ({
  items,
  rowHeight = DEFAULT_ROW_HEIGHT,
  tilesPerRow: tilesPerRowProp = DEFAULT_TILES_PER_ROW,
  onReachEnd,
  overscan = DEFAULT_OVERSCAN,
  className,
}: NftGalleryVirtualizedProps) => {
  const tilesPerRow = Math.max(MIN_TILES_PER_ROW, Math.floor(tilesPerRowProp));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // Fallback so the *first* paint before ResizeObserver ticks still has
  // something to show — otherwise `viewportHeight === 0` renders 0 rows on
  // mount, leaving the user staring at a blank container for one frame.
  const [viewportHeight, setViewportHeight] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_ROW_HEIGHT * 3;
    return Math.max(DEFAULT_ROW_HEIGHT, window.innerHeight);
  });

  // ------------------------------------------------------------------
  // Track the scroll position and the actual height of the container.
  // ResizeObserver makes the gallery resilient to window resizes without
  // forcing a re-mount.
  // ------------------------------------------------------------------
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    setViewportHeight(node.clientHeight);

    const handleScroll = () => setScrollTop(node.scrollTop);
    node.addEventListener("scroll", handleScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      setViewportHeight(node.clientHeight);
    });
    ro.observe(node);

    return () => {
      node.removeEventListener("scroll", handleScroll);
      ro.disconnect();
    };
  }, []);

  // ------------------------------------------------------------------
  // Compute the slice of rows we should actually mount.
  // ------------------------------------------------------------------
  const totalRows = Math.ceil(items.length / tilesPerRow);
  const startRow = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - overscan
  );
  const visibleRowCount =
    Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const endRow = Math.min(totalRows, startRow + visibleRowCount);
  const totalHeight = totalRows * rowHeight;

  const visibleItems = useMemo(() => {
    if (items.length === 0 || endRow <= startRow) return [];
    return items.slice(startRow * tilesPerRow, endRow * tilesPerRow);
  }, [items, startRow, endRow, tilesPerRow]);

  const visibleRows = useMemo(
    () => chunkByTilesPerRow(visibleItems, tilesPerRow),
    [visibleItems, tilesPerRow]
  );

  // ------------------------------------------------------------------
  // Bottom sentinel — notify the consumer when the user scrolls close
  // to the end so they can fetch the next page from the API (#104).
  // ------------------------------------------------------------------
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      const threshold = rowHeight * 2;
      const nearEnd =
        node.scrollHeight - node.scrollTop - node.clientHeight < threshold;
      if (nearEnd && onReachEnd) {
        onReachEnd();
      }
    },
    [onReachEnd, rowHeight]
  );

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        className={className}
        role="region"
        aria-label="NFT collection"
        style={{ minHeight: rowHeight }}
      >
        <p className="text-gray-300 text-center py-12">
          No NFTs yet — keep solving!
        </p>
      </div>
    );
  }

  // Per-row layout (not a single wrapper div) — fixes the multi-row overflow
  // bug picked up by the code review. Each row sits at its own `top` and
  // uses flexbox so tiles wrap correctly inside the row.
  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={className}
      role="region"
      aria-label="NFT collection"
      style={{
        position: "relative",
        height: "70vh",
        overflowY: "auto",
      }}
    >
      {/* Total height drives the scrollbar — only the visible rows are rendered. */}
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleRows.map((row, rowOffset) => {
          const absoluteRowIndex = startRow + rowOffset;
          const rowStyle: CSSProperties = {
            position: "absolute",
            top: absoluteRowIndex * rowHeight,
            left: 0,
            right: 0,
            display: "flex",
            flexWrap: "nowrap",
          };
          return (
            <div
              key={`row-${absoluteRowIndex}`}
              style={rowStyle}
              aria-rowindex={absoluteRowIndex + 1}
              role="row"
            >
              {row.map((nft, tileIdx) => {
                const tileStyle: CSSProperties = {
                  flex: `0 0 ${100 / tilesPerRow}%`,
                  padding: "0.75rem",
                  minWidth: 0,
                };
                const absoluteIndex =
                  absoluteRowIndex * tilesPerRow + tileIdx;
                return (
                  <div
                    key={(nft.id as string) ?? absoluteIndex}
                    style={tileStyle}
                  >
                    <NFTCard nft={nft as any} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NftGalleryVirtualized;
